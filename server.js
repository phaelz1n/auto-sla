const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const ImageModule = require('docxtemplater-image-module-free');

const app = express();
const port = 3000;

// Configurar o multer para upload em memória (não precisa salvar no disco)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Servir arquivos estáticos (interface HTML)
app.use(express.static('public'));

app.post('/generate', upload.single('logo'), (req, res) => {
    try {
        const { mes, rotas, ocorrencias, detalhes_ocorrencias } = req.body;
        
        // Verifica se o template existe
        const templatePath = path.resolve(__dirname, 'template_sla.docx');
        if (!fs.existsSync(templatePath)) {
            return res.status(400).send('O arquivo template_sla.docx não foi encontrado na pasta raiz.');
        }

        const content = fs.readFileSync(templatePath, 'binary');
        const zip = new PizZip(content);

        // Opções para o ImageModule
        const imageOptions = {
            centered: false,
            getImage: function(tagValue, tagName) {
                // Se a tag for logo, retornamos o buffer da imagem carregada
                if (tagName === 'logo' && req.file) {
                    return req.file.buffer;
                }
                return Buffer.from(''); // Retorna buffer vazio se não houver imagem
            },
            getSize: function(img, tagValue, tagName) {
                // Definir tamanho padrão para a logo (ajuste conforme necessário)
                // Retorna [largura, altura] em pixels
                return [150, 50]; 
            }
        };

        const imageModule = new ImageModule(imageOptions);

        const doc = new Docxtemplater(zip, {
            modules: [imageModule],
            paragraphLoop: true,
            linebreaks: true,
        });

        // Parse detalhes das ocorrencias (enviado como string JSON do frontend)
        let ocorrenciasList = [];
        try {
            if (detalhes_ocorrencias) {
                ocorrenciasList = JSON.parse(detalhes_ocorrencias);
            }
        } catch (e) {
            console.error("Erro ao parsear ocorrencias:", e);
        }

        // Calcula a meta percentual e nivel de servico
        const totalRotas = parseInt(rotas) || 0;
        const totalOcorrencias = parseInt(ocorrencias) || 0;
        let meta = 100;
        if (totalRotas > 0) {
            meta = ((totalRotas - totalOcorrencias) / totalRotas) * 100;
        }
        
        let nivel = 'Limite Crítico';
        if (meta >= 99.0) {
            nivel = 'Excelência (Alta Performance)';
        } else if (meta >= 97.0) {
            nivel = 'Padrão de Mercado (Saudável)';
        }

        // Definir as variáveis para substituição
        const dataToRender = {
            mes: mes,
            total_rotas: rotas,
            ocorrencias: ocorrencias,
            meta: meta.toFixed(2).replace('.', ',') + '%',
            nivel: nivel,
            lista_ocorrencias: ocorrenciasList
        };

        // Renderiza o documento
        doc.render(dataToRender);

        const buf = doc.getZip().generate({
            type: 'nodebuffer',
            compression: 'DEFLATE',
        });

        const outputFileName = `SLA_${mes.replace(/\//g, '-')}.docx`;

        // Envia o arquivo como download
        res.setHeader('Content-Disposition', `attachment; filename="${outputFileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.send(buf);

    } catch (error) {
        console.error('Erro ao gerar o documento:', error);
        res.status(500).send('Erro interno ao gerar o SLA: ' + error.message);
    }
});

app.listen(port, () => {
    console.log(`Auto SLA rodando em http://localhost:${port}`);
    console.log('Abra este link no seu navegador!');
});
