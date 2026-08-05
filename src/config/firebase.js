/**
 * Firebase config - inicializa o Firestore Admin SDK.
 * Suporta dois modos:
 *   - Local: lê o arquivo firebase-service-account.json
 *   - Vercel/produção: lê a variável de ambiente FIREBASE_SERVICE_ACCOUNT_JSON
 */
const path = require('path');
const fs   = require('fs');
const { createRequire } = require('module');

// Força require limpo, sem hooks do dotenvx
const cleanRequire = createRequire(__filename);

let db = null;

try {
    let serviceAccount;

    // Modo 1: variável de ambiente (Vercel / produção)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    }
    // Modo 2: arquivo local (desenvolvimento)
    else {
        const serviceAccountPath = path.resolve(
            process.env.FIREBASE_SERVICE_ACCOUNT || './firebase-service-account.json'
        );
        if (!fs.existsSync(serviceAccountPath)) {
            throw new Error(`firebase-service-account.json não encontrado em: ${serviceAccountPath}`);
        }
        serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    }

    const { initializeApp, cert, getApps } = cleanRequire('firebase-admin/app');
    const { getFirestore }                  = cleanRequire('firebase-admin/firestore');

    if (getApps().length === 0) {
        initializeApp({ credential: cert(serviceAccount) });
    }

    db = getFirestore();
    console.log(`[Firebase] Conectado ao projeto: ${serviceAccount.project_id}`);
} catch (e) {
    console.error('[Firebase] ERRO ao inicializar:', e.message);
    console.error('[Firebase] Configure FIREBASE_SERVICE_ACCOUNT_JSON no Vercel ou adicione firebase-service-account.json localmente.');
}

module.exports = db;
