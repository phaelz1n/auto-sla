const fs = require('fs');
const PizZip = require('pizzip');

function findTags(file) {
    try {
        const content = fs.readFileSync(file, 'binary');
        const zip = new PizZip(content);
        const xml = zip.file('word/document.xml').asText();
        // Regex to find things between { and }
        const tags = xml.match(/\{[^}]+\}/g);
        console.log("Tags em " + file + ":", tags);
    } catch(e) {
        console.log("Erro ao ler " + file);
    }
}

findTags('template_geral.docx');
