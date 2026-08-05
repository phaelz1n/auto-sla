require('dotenv').config();
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT || './firebase-service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error(`\n❌ ERRO: Arquivo de credenciais não encontrado: ${serviceAccountPath}`);
    process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });
const db = admin.firestore();

const clientes = [
    "AIVA", "CONTROIL", "DARCY PACHECO", "DROGA RAIA", "FIBRAPLAC",
    "FM LOGISTIC", "FREESURF", "GEDORE", "HERC", "HERTZ", "HT MICRON",
    "ISLA", "MARCHER", "MUNDIAL", "NEXTEER", "PERTO", "PROMETEON",
    "REITER", "SHOPEE", "SHOPEE ESTEIO", "SHOPEE NOVA SANTA RITA",
    "TEGMA", "UNIQUE", "VIDA", "VIEMAR", "VIKINGS", "WEG", "ZAFFARI"
];

async function seed() {
    console.log("Inserindo clientes no Firestore...");

    const batch = db.batch();
    for (const nome of clientes) {
        // Verifica se já existe
        const snapshot = await db.collection('clientes').where('nome', '==', nome).limit(1).get();
        if (!snapshot.empty) {
            console.log(`Cliente ${nome} já existe. Pulando...`);
            continue;
        }
        const ref = db.collection('clientes').doc();
        batch.set(ref, { nome });
        console.log(`Adicionado: ${nome}`);
    }

    await batch.commit();
    console.log("\n✅ Processo finalizado.");
    process.exit(0);
}

seed().catch(e => {
    console.error("Erro:", e.message);
    process.exit(1);
});
