const fs = require('fs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

try {
    const content = fs.readFileSync('C:\\Users\\opera\\OneDrive\\Documentos\\SLA Perto\\SLA OPERACIONAL PERTO 2026.docx', 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    console.log(doc.getFullText());
} catch (e) {
    console.error(e.message || e);
}
