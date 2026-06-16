const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const path = require('path');
const fs = require('fs');
const supabase = require('../config/supabase');

async function gerarSLA(periodo, clientes, rotasMap, tipoExportacao) {
    if (!supabase) throw new Error("Supabase não configurado no .env");
    
    const clientesList = JSON.parse(clientes);
    const isMensal = tipoExportacao === 'mensal';
    // Caminho da raiz
    const basePath = path.resolve(__dirname, '../../');
    const templateFile = isMensal ? 'template_mensal.docx' : 'template_geral.docx';
    const templatePath = path.join(basePath, templateFile);
    
    if (!fs.existsSync(templatePath)) {
        throw new Error(`O arquivo ${templateFile} não foi encontrado na pasta raiz.`);
    }

    const exportZip = new PizZip();
    let generatedFilesCount = 0;
    let lastBuf = null;

    for (const cliente_id of clientesList) {
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
        const dtFinal = new Date(anoFinal, parseInt(mesFinal), 0); 

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
        }).map(oc => ({
            ...oc,
            numero: oc.numero_original || '-'
        }));
        
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

        const tituloPeriodo = isRange ? `${parts[0]} a ${parts[1]}` : periodo;
        const metasMensais = typeof rotasMap === 'string' ? JSON.parse(rotasMap)[cliente_id] || {} : rotasMap[cliente_id] || {};
        
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
        
        let metaGeral = 100;
        if (somaRotasPeriodo > 0) metaGeral = ((somaRotasPeriodo - somaOcorrenciasPeriodo) / somaRotasPeriodo) * 100;
        let nivelGeral = 'Limite Crítico (Plano de Ação)';
        if (metaGeral >= 99.0) nivelGeral = 'Excelência (Alta Performance)';
        else if (metaGeral >= 97.0) nivelGeral = 'Padrão de Mercado (Saudável)';

        const mediaRotasPeriodo = Math.round(somaRotasPeriodo / Math.max(1, mesesResultados.length));
        
        const mTolerancia = Math.round(mediaRotasPeriodo * 0.03);
        const mMeta = Math.round(mediaRotasPeriodo * 0.01);
        const mPadraoMin = Math.round(mediaRotasPeriodo * 0.02);
        const mCritico = Math.round(mediaRotasPeriodo * 0.05);

        let mPeso = "0,000";
        if (mediaRotasPeriodo > 0) {
            mPeso = ((1 / mediaRotasPeriodo) * 100).toFixed(3).replace('.', ',');
        }

        const docData = {
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
        const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
        
        doc.render(docData);
        
        const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
        lastBuf = buf;
        generatedFilesCount++;
        
        const safeCliente = nome_cliente.replace(/[^a-zA-Z0-9]/g, '_');
        const safeMonth = periodo.replace(/\//g, '-');
        exportZip.file(`SLA_${safeCliente}_${safeMonth}.docx`, buf);
    }

    if (generatedFilesCount === 1) {
        return { isZip: false, buf: lastBuf };
    } else {
        const finalZipBuf = exportZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
        return { isZip: true, buf: finalZipBuf };
    }
}

module.exports = { gerarSLA };
