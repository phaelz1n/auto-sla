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
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
}

// Configurar o multer para upload em memória (não precisa salvar no disco)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Servir arquivos estáticos e parsear JSON
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));

app.get('/api/clientes', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: "Supabase não configurado no .env" });
    const { data, error } = await supabase.from('clientes').select('*').order('nome', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/ocorrencias/:cliente_id', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: "Supabase não configurado no .env" });
    const { data, error } = await supabase.from('ocorrencias').select('*').eq('cliente_id', req.params.cliente_id).order('created_at', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/salvar-dados', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: "Supabase não configurado no .env" });
    
    let { cliente_nome, ocorrencias } = req.body;
    if (!cliente_nome) return res.status(400).json({ error: "Nome do cliente é obrigatório" });
    
    cliente_nome = cliente_nome.trim();

    try {
        let { data: clienteData, error: clienteError } = await supabase
            .from('clientes')
            .select('*')
            .ilike('nome', cliente_nome)
            .single();
            
        if (clienteError && clienteError.code !== 'PGRST116') {
            return res.status(500).json({ error: clienteError.message });
        }

        let cliente_id;
        if (!clienteData) {
            const { data: newCliente, error: insertError } = await supabase
                .from('clientes')
                .insert([{ nome: cliente_nome }])
                .select()
                .single();
            if (insertError) return res.status(500).json({ error: insertError.message });
            cliente_id = newCliente.id;
        } else {
            cliente_id = clienteData.id;
        }

        const { error: deleteError } = await supabase
            .from('ocorrencias')
            .delete()
            .eq('cliente_id', cliente_id);
        if (deleteError) return res.status(500).json({ error: deleteError.message });

        if (ocorrencias && ocorrencias.length > 0) {
            const insertData = ocorrencias.map(oc => ({
                cliente_id: cliente_id,
                numero_original: oc.numero || '',
                data: oc.data || '',
                descricao: oc.descricao || '',
                status: oc.status || ''
            }));
            
            const { error: insertOcError } = await supabase.from('ocorrencias').insert(insertData);
            if (insertOcError) return res.status(500).json({ error: insertOcError.message });
        }

        res.json({ success: true, message: "Dados salvos com sucesso!" });
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

    app.post('/generate', upload.single('logo'), (req, res) => {
        try {
            const { mes, detalhes_ocorrencias, tipo_exportacao, nome_cliente, ...rest } = req.body;
            
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

            let ocorrenciasList = [];
            try {
                if (detalhes_ocorrencias) ocorrenciasList = JSON.parse(detalhes_ocorrencias);
            } catch (e) { console.error(e); }

            const rotasPorMes = {};
            for (const key in rest) {
                if (key.startsWith('rotas_')) {
                    const m = key.replace('rotas_', '').trim();
                    rotasPorMes[m] = parseInt(rest[key]) || 0;
                }
            }

            const agrupado = {};
            ocorrenciasList.forEach(oc => {
                let m = 'Desconhecido';
                if (oc.data) {
                    const match = oc.data.match(/(\d{1,2})[\/\-](\d{4})/);
                    if (match) {
                        m = match[1].padStart(2, '0') + '/' + match[2];
                    }
                }
                if (!agrupado[m]) agrupado[m] = [];
                agrupado[m].push(oc);
            });

            const mesesData = [];
            for (const m in rotasPorMes) {
                const rotas = rotasPorMes[m];
                const ocorrenciasMes = agrupado[m] ? agrupado[m].length : 0;
                let meta = 100;
                if (rotas > 0) meta = ((rotas - ocorrenciasMes) / rotas) * 100;
                
                let nivel = 'Limite Crítico (Plano de Ação)';
                if (meta >= 99.0) nivel = 'Excelência (Alta Performance)';
                else if (meta >= 97.0) nivel = 'Padrão de Mercado (Saudável)';

                mesesData.push({
                    mes: m, rotas, ocorrencias: ocorrenciasMes, 
                    meta: meta.toFixed(2).replace('.', ','), nivel
                });
            }

            mesesData.sort((a, b) => {
                if(a.mes === 'Desconhecido') return 1;
                if(b.mes === 'Desconhecido') return -1;
                const [m1, y1] = a.mes.split('/');
                const [m2, y2] = b.mes.split('/');
                return parseInt(y1+m1) - parseInt(y2+m2);
            });

            // Calcula médias globais para o template Geral
            let totalRotasGlobal = 0;
            let totalOcorrenciasGlobal = 0;
            for (const m in rotasPorMes) {
                totalRotasGlobal += rotasPorMes[m];
                totalOcorrenciasGlobal += (agrupado[m] ? agrupado[m].length : 0);
            }
            const numMeses = Object.keys(rotasPorMes).length || 1;
            const mediaRotasGlobal = Math.round(totalRotasGlobal / numMeses);
            const toleranciaOcorrenciasGlobal = Math.round(mediaRotasGlobal * 0.03);
            const metaOcorrenciasGlobal = Math.round(mediaRotasGlobal * 0.01);
            const padraoMinimoGlobal = Math.round(mediaRotasGlobal * 0.02);
            const criticoOcorrenciasGlobal = Math.round(mediaRotasGlobal * 0.05);
            
            let pesoEstatisticoGlobal = "0,000";
            if (mediaRotasGlobal > 0) {
                pesoEstatisticoGlobal = ((1 / mediaRotasGlobal) * 100).toFixed(3).replace('.', ',');
            }

            if (!isMensal) {
                const content = fs.readFileSync(templatePath, 'binary');
                const zip = new PizZip(content);
                const doc = new Docxtemplater(zip, { modules: [getImageModule()], paragraphLoop: true, linebreaks: true });
                doc.render({ 
                    logo: "placeholder",
                    nome_cliente: nome_cliente,
                    titulo: mes, 
                    meses: mesesData,
                    rotas: mediaRotasGlobal,
                    media_rotas: mediaRotasGlobal,
                    total_rotas: totalRotasGlobal,
                    ocorrencias: totalOcorrenciasGlobal,
                    tolerancia_ocorrencias: toleranciaOcorrenciasGlobal,
                    meta_ocorrencias: metaOcorrenciasGlobal,
                    padrao_minimo: padraoMinimoGlobal,
                    critico_ocorrencias: criticoOcorrenciasGlobal,
                    peso_estatistico: pesoEstatisticoGlobal
                });
                const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
                res.setHeader('Content-Disposition', 'attachment; filename="SLA_Consolidado.docx"');
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
                return res.send(buf);
            } else {
                const exportZip = new PizZip();
                let singleBuf = null;
                for (const mData of mesesData) {
                    const content = fs.readFileSync(templatePath, 'binary');
                    const zip = new PizZip(content);
                    const doc = new Docxtemplater(zip, { modules: [getImageModule()], paragraphLoop: true, linebreaks: true });
                    const ocorrenciasMes = agrupado[mData.mes] || [];
                    
                    const mRotas = mData.rotas;
                    const mTolerancia = Math.round(mRotas * 0.03);
                    const mMeta = Math.round(mRotas * 0.01);
                    const mPadraoMin = Math.round(mRotas * 0.02);
                    const mCritico = Math.round(mRotas * 0.05);

                    let mPeso = "0,000";
                    if (mRotas > 0) {
                        mPeso = ((1 / mRotas) * 100).toFixed(3).replace('.', ',');
                    }

                    doc.render({
                        logo: "placeholder",
                        nome_cliente: nome_cliente,
                        mes: mData.mes,
                        total_rotas: mRotas,
                        ocorrencias: mData.ocorrencias,
                        meta: mData.meta + '%',
                        nivel: mData.nivel,
                        lista_ocorrencias: ocorrenciasMes,
                        rotas: mRotas,
                        media_rotas: mRotas,
                        tolerancia_ocorrencias: mTolerancia,
                        meta_ocorrencias: mMeta,
                        padrao_minimo: mPadraoMin,
                        critico_ocorrencias: mCritico,
                        peso_estatistico: mPeso
                    });
                    singleBuf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
                    const safeMonth = mData.mes.replace(/\//g, '-');
                    exportZip.file(`SLA_${safeMonth}.docx`, singleBuf);
                }

                if (mesesData.length === 1 && singleBuf) {
                    res.setHeader('Content-Disposition', 'attachment; filename="SLA_Mensal.docx"');
                    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
                    return res.send(singleBuf);
                } else {
                    const finalZipBuf = exportZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
                    res.setHeader('Content-Disposition', 'attachment; filename="SLAs_Mensais.zip"');
                    res.setHeader('Content-Type', 'application/zip');
                    return res.send(finalZipBuf);
                }
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
