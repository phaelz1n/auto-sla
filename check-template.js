const fs = require('fs');
const PizZip = require('pizzip');

function checkDoc(file) {
    try {
        const content = fs.readFileSync(file, 'binary');
        const zip = new PizZip(content);
        const xml = zip.file('word/document.xml').asText();
        if (xml.includes('undefined')) {
            console.log(file + " TEM A PALAVRA UNDEFINED ESCRITA NELE!");
        } else if (xml.includes('{media_rotas}')) {
            console.log(file + " tem a tag {media_rotas} correta.");
        } else {
            console.log(file + " nao tem undefined nem {media_rotas}.");
        }
    } catch(e) {
        console.log("Erro ao ler " + file);
    }
}

checkDoc('template_geral.docx');
checkDoc('template_mensal.docx');
