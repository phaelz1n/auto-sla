const express = require('express');
const router  = express.Router();
const { gerarSLA, gerarSLAAutomatizado } = require('../services/slaGenerator');

/**
 * POST /api/gerar-sla-novo
 *
 * Usa o gerador automatizado por padrao (sem depender do template .docx).
 * Passe tipo_exportacao = "template" para usar o gerador legado via docxtemplater.
 */
router.post('/gerar-sla-novo', async (req, res) => {
    try {
        const { periodo, clientes, rotas, tipo_exportacao } = req.body;

        let result;

        if (tipo_exportacao === 'template') {
            // Modo legado: usa o arquivo template_geral.docx ou template_mensal.docx
            result = await gerarSLA(periodo, clientes, rotas, 'geral');
        } else {
            // Modo automatizado: gera o DOCX inteiramente em codigo
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
