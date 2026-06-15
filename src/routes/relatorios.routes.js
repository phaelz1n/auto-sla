const express = require('express');
const router = express.Router();
const multer = require('multer');
const { gerarSLA } = require('../services/slaGenerator');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/gerar-sla-novo', upload.single('logo'), async (req, res) => {
    try {
        const { periodo, clientes, rotas, tipo_exportacao } = req.body;
        const logoBuffer = req.file ? req.file.buffer : null;
        
        const result = await gerarSLA(periodo, clientes, rotas, tipo_exportacao, logoBuffer);
        
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
