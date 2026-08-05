const path = require('path');
const fs = require('fs');

let db = null;

try {
    const serviceAccountPath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT || './firebase-service-account.json');
    if (!fs.existsSync(serviceAccountPath)) {
        throw new Error(`Arquivo não encontrado: ${serviceAccountPath}`);
    }
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

    const { initializeApp, cert, getApps } = require('firebase-admin/app');
    const { getFirestore } = require('firebase-admin/firestore');

    if (getApps().length === 0) {
        initializeApp({ credential: cert(serviceAccount) });
    }
    db = getFirestore();
} catch (e) {
    console.error('Erro ao inicializar Firebase:', e.message);
    console.error('Certifique-se de que firebase-service-account.json existe na pasta do projeto.');
}

module.exports = db;
