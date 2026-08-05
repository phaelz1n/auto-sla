/**
 * Firebase config - inicializa o Firestore Admin SDK.
 * Usa Module.createRequire para isolar do hook dotenvx/NODE_OPTIONS.
 */
const path = require('path');
const fs   = require('fs');
const { createRequire } = require('module');

// Força require limpo, sem hooks do dotenvx
const cleanRequire = createRequire(__filename);

let db = null;

try {
    const serviceAccountPath = path.resolve(
        process.env.FIREBASE_SERVICE_ACCOUNT || './firebase-service-account.json'
    );

    if (!fs.existsSync(serviceAccountPath)) {
        throw new Error(`firebase-service-account.json não encontrado em: ${serviceAccountPath}`);
    }

    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

    const { initializeApp, cert, getApps } = cleanRequire('firebase-admin/app');
    const { getFirestore }                  = cleanRequire('firebase-admin/firestore');

    if (getApps().length === 0) {
        initializeApp({ credential: cert(serviceAccount) });
    }

    db = getFirestore();
    console.log(`[Firebase] Conectado ao projeto: ${serviceAccount.project_id}`);
} catch (e) {
    console.error('[Firebase] ERRO ao inicializar:', e.message);
    console.error('[Firebase] Certifique-se de que firebase-service-account.json existe na pasta do projeto.');
}

module.exports = db;
