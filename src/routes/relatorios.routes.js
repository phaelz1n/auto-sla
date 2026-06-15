const express = require('express');
const router = express.Router();
const { gerarSLA } = require('../services/slaGenerator');

router.post('/gerar-sla-novo', async (req, res) => {
    try {
        const { periodo, clientes, rotas, tipo_exportacao } = req.body;
        
        const result = await gerarSLA(periodo, clientes, rotas, tipo_exportacao);
        
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
