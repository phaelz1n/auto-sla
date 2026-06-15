const fs = require('fs');
const PizZip = require('pizzip');

try {
    const content = fs.readFileSync('C:\\Users\\opera\\OneDrive\\Documentos\\SLA Perto\\SLA OPERACIONAL PERTO 2026.docx', 'binary');
    const zip = new PizZip(content);
    const docXml = zip.file("word/document.xml").asText();
    fs.writeFileSync('C:\\Users\\opera\\OneDrive\\Documentos\\auto-sla\\document.xml', docXml);
    console.log("Extracted document.xml, length:", docXml.length);
} catch(e) {
    console.error(e);
}
