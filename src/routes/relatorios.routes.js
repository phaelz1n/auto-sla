const express = require('express');
const router  = express.Router();
const { gerarSLA, gerarSLAAutomatizado } = require('../services/slaGenerator');
const { gerarSLAHtml }                   = require('../services/slaHtmlGenerator');

/**
 * GET /api/visualizar-sla
 * Retorna um HTML completo e pronto para impressão/PDF.
 * Query params: cliente_id, periodo, rotas (JSON string)
 */
router.get('/visualizar-sla', async (req, res) => {
    try {
        const { cliente_id, periodo, rotas } = req.query;
        if (!cliente_id || !periodo) {
            return res.status(400).send('Parâmetros cliente_id e periodo são obrigatórios.');
        }
        const rotasMap = rotas ? JSON.parse(decodeURIComponent(rotas)) : {};
        const html = await gerarSLAHtml(cliente_id, periodo, rotasMap);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (error) {
        console.error('Erro ao gerar visualização SLA:', error);
        res.status(500).send('<h2>Erro ao gerar o relatório: ' + error.message + '</h2>');
    }
});

/**
 * POST /api/gerar-sla-novo
 * Usa o gerador automatizado por padrão (sem depender do template .docx).
 * Passe tipo_exportacao = "template" para usar o gerador legado via docxtemplater.
 */
router.post('/gerar-sla-novo', async (req, res) => {
    try {
        const { periodo, clientes, rotas, tipo_exportacao } = req.body;

        let result;
        if (tipo_exportacao === 'template') {
            result = await gerarSLA(periodo, clientes, rotas, 'geral');
        } else {
            const clientesList = JSON.parse(clientes);
            const rotasMap     = typeof rotas === 'string' ? JSON.parse(rotas) : rotas;
            result = await gerarSLAAutomatizado(periodo, clientesList, rotasMap);
        }

        if (!result.isZip) {
            res.setHeader('Content-Disposition', 'attachment; filename="SLA_Gerado.docx"');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            return res.send(result.buf);
        } else {
            res.setHeader('Content-Disposition', 'attachment; filename="SLAs_Lote.zip"');
            res.setHeader('Content-Type', 'application/zip');
            return res.send(result.buf);
        }

    } catch (error) {
        console.error('Erro ao gerar o documento:', error);
        res.status(500).send('Erro interno ao gerar o SLA: ' + error.message);
    }
});

module.exports = router;
