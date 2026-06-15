const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const ImageModule = require('docxtemplater-image-module-free');
require('dotenv').config();
const Tesseract = require('tesseract.js');

const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = 3000;

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    const url = process.env.SUPABASE_URL.trim();
    const key = process.env.SUPABASE_KEY.trim();
    supabase = createClient(url, key);
}

// Configurar o multer para upload em memória (não precisa salvar no disco)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Servir arquivos estáticos e parsear JSON
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));

app.get('/api/clientes', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: "Supabase não configurado no .env" });
    try {
        const { data, error } = await supabase.from('clientes').select('*').order('nome', { ascending: true });
        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    } catch (e) {
        console.error('Erro no /api/clientes:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/ocorrencias/:cliente_id', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: "Supabase não configurado no .env" });
    const { data, error } = await supabase.from('ocorrencias').select('*').eq('cliente_id', req.params.cliente_id).order('created_at', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/ocorrencias/lote', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: "Supabase não configurado no .env" });
    
    const { ocorrencias } = req.body;
    if (!ocorrencias || !ocorrencias.length) return res.status(400).json({ error: "Nenhuma ocorrência enviada" });

    const hasInvalid = ocorrencias.some(o => !o.cliente_id);
    if (hasInvalid) return res.status(400).json({ error: "Todas as ocorrências precisam de um cliente associado." });

    try {
        // Agrupar por cliente e ano
        const grouped = {};
        for (const oc of ocorrencias) {
            if (!oc.data) continue;
            const match = oc.data.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
            if (!match) continue;
            const yearStr = match[3];
            const yearShort = yearStr.slice(-2);
            const client = oc.cliente_id;
            
            const key = `${client}_${yearShort}`;
            if (!grouped[key]) {
                grouped[key] = { client, yearShort, yearStr, items: [] };
            }
            grouped[key].items.push(oc);
        }

        // Determinar o sequencial correto para cada grupo
        for (const key of Object.keys(grouped)) {
            const group = grouped[key];
            
            const { data: existingOc, error: searchError } = await supabase
                .from('ocorrencias')
                .select('numero_original')
                .eq('cliente_id', group.client);
                
            let usedSeqs = new Set();
            if (!searchError && existingOc) {
                for (const row of existingOc) {
                    if (row.numero_original && row.numero_original.endsWith(`/${group.yearShort}`)) {
                        const m = row.numero_original.match(/^(\d+)\//);
                        if (m) {
                            usedSeqs.add(parseInt(m[1], 10));
                        }
                    }
                }
            }
            
            // Ordenar items novos por data para atribuir números cronologicamente
            group.items.sort((a, b) => {
                const parseDate = (str) => {
                    const parts = str.split(/[\/\-]/);
                    if (parts.length === 3) return parseInt(parts[2] + parts[1] + parts[0], 10);
                    return 0;
                };
                return parseDate(a.data) - parseDate(b.data);
            });

            let currentSeqCandidate = 1;
            for (const item of group.items) {
                while (usedSeqs.has(currentSeqCandidate)) {
                    currentSeqCandidate++;
                }
                usedSeqs.add(currentSeqCandidate);
                const seqStr = String(currentSeqCandidate).padStart(3, '0');
                item.numero_original = `${seqStr}/${group.yearShort}`;
            }
        }

        const { error } = await supabase.from('ocorrencias').insert(ocorrencias);
        if (error) return res.status(500).json({ error: error.message });
        res.json({ success: true, message: "Ocorrências salvas no banco com sucesso!" });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/clientes-com-ocorrencias', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: "Supabase não configurado no .env" });
    const { periodo } = req.query; 
    if (!periodo) return res.status(400).json({ error: "Período é obrigatório" });

    try {
        const { data, error } = await supabase
            .from('ocorrencias')
            .select('cliente_id, clientes(nome)')
            .like('data', `%${periodo}%`);
            
        if (error) return res.status(500).json({ error: error.message });

        const clientesMap = {};
        data.forEach(oc => {
            const cId = oc.cliente_id;
            if (!clientesMap[cId]) {
                clientesMap[cId] = {
                    id: cId,
                    nome: oc.clientes.nome,
                    ocorrencias_count: 0
                };
            }
            clientesMap[cId].ocorrencias_count++;
        });
        
        res.json(Object.values(clientesMap).sort((a,b) => a.nome.localeCompare(b.nome)));
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/process-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
        }

        const { data: { text } } = await Tesseract.recognize(req.file.buffer, 'por');
        
        let dataEncontrada = "";
        const dataMatch = text.match(/\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/);
        if (dataMatch) {
            dataEncontrada = dataMatch[1];
        } else {
            const dataMatchCurta = text.match(/\b(\d{2}[\/\-]\d{2}[\/\-]\d{2})\b/);
            if (dataMatchCurta) {
                dataEncontrada = dataMatchCurta[1];
            }
        }

        let descricaoPart = text.trim();
        let statusPart = "";

        // Heurística para tentar separar a resolução (busca por Status, Resolução, Tratativa, etc)
        const regexSplit = /(?:\n|\b)(status|resolução|resolucao|ação tomada|tratativa|impacto|solução)[:\-]?\s/is;
        const splitMatch = descricaoPart.match(regexSplit);
        
        if (splitMatch) {
            descricaoPart = text.substring(0, splitMatch.index).trim();
            statusPart = text.substring(splitMatch.index).trim();
        }

        const jsonResult = {
            data: dataEncontrada,
            descricao: descricaoPart,
            status: statusPart
        };

        res.json(jsonResult);
    } catch (error) {
        console.error("Erro no OCR:", error);
        res.status(500).json({ error: 'Erro ao processar imagem pelo OCR.' });
    }
});

// Rota para regerar a numeração de todas as ocorrências existentes
app.post('/api/ocorrencias/regerar-numeros', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: "Supabase não configurado no .env" });
    try {
        const { data: todasOcorrencias, error: fetchError } = await supabase
            .from('ocorrencias')
            .select('id, data, cliente_id, numero_original');
            
        if (fetchError) throw fetchError;
        if (!todasOcorrencias || todasOcorrencias.length === 0) {
            return res.json({ success: true, message: "Nenhuma ocorrência encontrada." });
        }

        const grouped = {};
        for (const oc of todasOcorrencias) {
            if (!oc.data) continue;
            const match = oc.data.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
            if (!match) continue;
            const yearStr = match[3];
            const yearShort = yearStr.slice(-2);
            const client = oc.cliente_id;
            
            if (!client) continue;

            const key = `${client}_${yearShort}`;
            if (!grouped[key]) grouped[key] = { items: [] };
            grouped[key].items.push(oc);
        }

        const updates = [];
        for (const key of Object.keys(grouped)) {
            const group = grouped[key];
            const yearShort = key.split('_')[1];
            
            group.items.sort((a, b) => {
                const parseDate = (str) => {
                    const parts = str.split(/[\/\-]/);
                    if (parts.length === 3) return parseInt(parts[2] + parts[1] + parts[0], 10);
                    return 0;
                };
                const diff = parseDate(a.data) - parseDate(b.data);
                if (diff === 0) return a.id - b.id; // stable sort
                return diff;
            });

            let seq = 0;
            for (const item of group.items) {
                seq++;
                const seqStr = String(seq).padStart(3, '0');
                const novoNumero = `${seqStr}/${yearShort}`;
                if (item.numero_original !== novoNumero) {
                    updates.push({ id: item.id, numero_original: novoNumero });
                }
            }
        }

        let updatedCount = 0;
        for (const up of updates) {
            await supabase.from('ocorrencias').update({ numero_original: up.numero_original }).eq('id', up.id);
            updatedCount++;
        }

        res.json({ success: true, message: `Numeração regerada com sucesso para ${updatedCount} ocorrências.` });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Rota para deletar uma ocorrência
app.delete('/api/ocorrencias/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('ocorrencias')
            .delete()
            .eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        console.error("Erro ao deletar:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/gerar-sla-novo', upload.single('logo'), async (req, res) => {
    try {
        const { periodo, clientes, rotas, tipo_exportacao } = req.body;
        const clientesList = JSON.parse(clientes); // Array de IDs de clientes
        const rotasMap = JSON.parse(rotas); // { cliente_id: rotas }
        
        const isMensal = tipo_exportacao === 'mensal';
        const templateFile = isMensal ? 'template_mensal.docx' : 'template_geral.docx';
        const templatePath = path.resolve(__dirname, templateFile);
        
        if (!fs.existsSync(templatePath)) {
            return res.status(400).send(`O arquivo ${templateFile} não foi encontrado na pasta raiz.`);
        }

        const imageOptions = {
            centered: false,
            getImage: function(tagValue, tagName) {
                if (tagName === 'logo' && req.file) return req.file.buffer;
                return Buffer.from(''); 
            },
            getSize: function(img, tagValue, tagName) {
                return [150, 50]; 
            }
        };
        const getImageModule = () => new ImageModule(imageOptions);

        const exportZip = new PizZip();
        let generatedFilesCount = 0;
        let lastBuf = null;

        for (const cliente_id of clientesList) {
            // Buscar dados do cliente
            const { data: clienteData } = await supabase.from('clientes').select('nome').eq('id', cliente_id).single();
            const nome_cliente = clienteData ? clienteData.nome : 'Cliente Desconhecido';

            const isRange = periodo.includes('-');
            let mesInicial, anoInicial, mesFinal, anoFinal, parts;
            
            if (isRange) {
                parts = periodo.split('-');
                [mesInicial, anoInicial] = parts[0].split('/');
                [mesFinal, anoFinal] = parts[1].split('/');
            } else {
                [mesInicial, anoInicial] = periodo.split('/');
                mesFinal = mesInicial;
                anoFinal = anoInicial;
            }

            const dtInicial = new Date(anoInicial, parseInt(mesInicial) - 1, 1);
            const dtFinal = new Date(anoFinal, parseInt(mesFinal), 0); // último dia do mês final

            // Buscar todas as ocorrências do cliente e filtrar no Node.js por segurança com datas
            const { data: ocorrenciasData } = await supabase
                .from('ocorrencias')
                .select('*')
                .eq('cliente_id', cliente_id);
                
            let ocorrenciasList = (ocorrenciasData || []).filter(oc => {
                if (!oc.data) return false;
                const match = oc.data.match(/(\d{2})\/(\d{2})\/(\d{4})/);
                if (!match) return false;
                const ocDate = new Date(match[3], parseInt(match[2]) - 1, parseInt(match[1]));
                return ocDate >= dtInicial && ocDate <= dtFinal;
            });
            
            const agrupado = {};
            ocorrenciasList.forEach(oc => {
                let m = 'Desconhecido';
                if (oc.data) {
                    const match = oc.data.match(/(\d{1,2})[\/\-](\d{2})[\/\-](\d{4})/);
                    if (match) m = match[2].padStart(2, '0') + '/' + match[3];
                }
                if (!agrupado[m]) agrupado[m] = [];
                agrupado[m].push(oc);
            });

            // Para relatórios consolidados de múltiplos meses, o título é o range
            const tituloPeriodo = isRange ? `${parts[0]} a ${parts[1]}` : periodo;
            
            const metasMensais = rotasMap[cliente_id] || {}; // Ex: { "04/2026": 500, "05/2026": 624 }
            
            // Vamos iterar sobre o período e gerar a lista de meses
            let dLoop = new Date(dtInicial);
            const mesesResultados = [];
            let somaRotasPeriodo = 0;
            let somaOcorrenciasPeriodo = 0;

            while (dLoop <= dtFinal) {
                const monthStr = String(dLoop.getMonth() + 1).padStart(2, '0') + '/' + dLoop.getFullYear();
                
                const rotasDesteMes = metasMensais[monthStr] || 0;
                const ocorrenciasDesteMes = agrupado[monthStr] ? agrupado[monthStr].length : 0;
                
                somaRotasPeriodo += rotasDesteMes;
                somaOcorrenciasPeriodo += ocorrenciasDesteMes;
                
                let meta = 100;
                if (rotasDesteMes > 0) meta = ((rotasDesteMes - ocorrenciasDesteMes) / rotasDesteMes) * 100;
                
                let nivel = 'Limite Crítico (Plano de Ação)';
                if (meta >= 99.0) nivel = 'Excelência (Alta Performance)';
                else if (meta >= 97.0) nivel = 'Padrão de Mercado (Saudável)';

                const ocorrenciasDoMes = ocorrenciasList.filter(o => o.data.includes(monthStr));

                mesesResultados.push({
                    mes: monthStr,
                    rotas: rotasDesteMes,
                    ocorrencias: ocorrenciasDesteMes,
                    meta: meta.toFixed(2).replace('.', ',') + '%',
                    nivel: nivel,
                    lista_ocorrencias_mes: ocorrenciasDoMes
                });

                dLoop.setMonth(dLoop.getMonth() + 1);
            }
            
            // Meta Geral Consolidada
            let metaGeral = 100;
            if (somaRotasPeriodo > 0) metaGeral = ((somaRotasPeriodo - somaOcorrenciasPeriodo) / somaRotasPeriodo) * 100;
            let nivelGeral = 'Limite Crítico (Plano de Ação)';
            if (metaGeral >= 99.0) nivelGeral = 'Excelência (Alta Performance)';
            else if (metaGeral >= 97.0) nivelGeral = 'Padrão de Mercado (Saudável)';

            const mediaRotasPeriodo = Math.round(somaRotasPeriodo / Math.max(1, mesesResultados.length));
            
            // Calculando tolerâncias baseadas na média do período
            const mTolerancia = Math.round(mediaRotasPeriodo * 0.03);
            const mMeta = Math.round(mediaRotasPeriodo * 0.01);
            const mPadraoMin = Math.round(mediaRotasPeriodo * 0.02);
            const mCritico = Math.round(mediaRotasPeriodo * 0.05);

            let mPeso = "0,000";
            if (mediaRotasPeriodo > 0) {
                mPeso = ((1 / mediaRotasPeriodo) * 100).toFixed(3).replace('.', ',');
            }

            const docData = {
                logo: "placeholder",
                nome_cliente: nome_cliente,
                titulo: isMensal ? periodo : `Consolidado ${tituloPeriodo}`,
                mes: tituloPeriodo,
                total_rotas: somaRotasPeriodo,
                media_rotas: mediaRotasPeriodo,
                rotas: isMensal ? somaRotasPeriodo : mediaRotasPeriodo,
                ocorrencias: somaOcorrenciasPeriodo,
                meta: metaGeral.toFixed(2).replace('.', ',') + '%',
                nivel: nivelGeral,
                tolerancia_ocorrencias: mTolerancia,
                meta_ocorrencias: mMeta,
                padrao_minimo: mPadraoMin,
                critico_ocorrencias: mCritico,
                peso_estatistico: mPeso,
                lista_ocorrencias: ocorrenciasList,
                meses: mesesResultados
            };

            const content = fs.readFileSync(templatePath, 'binary');
            const zip = new PizZip(content);
            const doc = new Docxtemplater(zip, { modules: [getImageModule()], paragraphLoop: true, linebreaks: true });
            
            doc.render(docData);
            
            const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
            lastBuf = buf;
            generatedFilesCount++;
            
            const safeCliente = nome_cliente.replace(/[^a-zA-Z0-9]/g, '_');
            const safeMonth = periodo.replace(/\//g, '-');
            exportZip.file(`SLA_${safeCliente}_${safeMonth}.docx`, buf);
        }

        if (generatedFilesCount === 1) {
            res.setHeader('Content-Disposition', 'attachment; filename="SLA_Gerado.docx"');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            return res.send(lastBuf);
        } else {
            const finalZipBuf = exportZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
            res.setHeader('Content-Disposition', 'attachment; filename="SLAs_Lote.zip"');
            res.setHeader('Content-Type', 'application/zip');
            return res.send(finalZipBuf);
        }

    } catch (error) {
        console.error('Erro ao gerar o documento:', error);
        res.status(500).send('Erro interno ao gerar o SLA: ' + error.message);
    }
});

if (require.main === module) {
    app.listen(port, () => {
        console.log(`Auto SLA rodando em http://localhost:${port}`);
        console.log('Abra este link no seu navegador!');
    });
}

module.exports = app;
