'use strict';

const path = require('path');
const fs   = require('fs');

// ─── Service Account ──────────────────────────────────────────────────────────
const serviceAccountPath = path.resolve('./firebase-service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error('\n❌ ERRO: firebase-service-account.json não encontrado na pasta do projeto.');
    process.exit(1);
}
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

// ─── Firebase Admin (usando submodules modernos - compatível com firebase-admin v12+) ──
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

if (getApps().length === 0) {
    initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

// ─── Supabase (leitura dos dados antigos) ─────────────────────────────────────
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://afktcwifzkqbwdodtbyw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFma3Rjd2lmemtxYndkb2R0Ynl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0OTgwMDAsImV4cCI6MjA5NzA3NDAwMH0.jRGZj4M1sAOioPVEprDxUMfW58_9y4mMbo-tNHEywt8';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Migração de clientes ─────────────────────────────────────────────────────
async function migrarClientes() {
    console.log('\n📋 Migrando clientes...');
    const { data, error } = await supabase.from('clientes').select('*');
    if (error) throw new Error(`Supabase erro: ${error.message}`);
    if (!data || data.length === 0) { console.log('  Nenhum cliente encontrado.'); return; }

    const batch = db.batch();
    data.forEach(c => {
        const ref = db.collection('clientes').doc(String(c.id));
        batch.set(ref, { nome: c.nome }, { merge: true });
    });
    await batch.commit();
    console.log(`  ✅ ${data.length} clientes migrados`);
}

// ─── Migração de ocorrências ──────────────────────────────────────────────────
async function migrarOcorrencias() {
    console.log('\n📋 Migrando ocorrências...');
    const { data, error } = await supabase.from('ocorrencias').select('*');
    if (error) throw new Error(`Supabase erro: ${error.message}`);
    if (!data || data.length === 0) { console.log('  Nenhuma ocorrência encontrada.'); return; }

    const BATCH_SIZE = 400;
    let total = 0;
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = db.batch();
        const slice = data.slice(i, i + BATCH_SIZE);
        slice.forEach(oc => {
            const ref = db.collection('ocorrencias').doc(String(oc.id));
            const doc = {};
            Object.keys(oc).forEach(k => {
                if (k === 'id') return;
                if (k === 'cliente_id') { doc.cliente_id = String(oc.cliente_id); return; }
                if (k === 'created_at') {
                    doc.created_at = oc.created_at
                        ? Timestamp.fromDate(new Date(oc.created_at))
                        : FieldValue.serverTimestamp();
                    return;
                }
                doc[k] = oc[k] != null ? oc[k] : null;
            });
            batch.set(ref, doc, { merge: true });
        });
        await batch.commit();
        total += slice.length;
        console.log(`  ✅ ${total}/${data.length} ocorrências migradas`);
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('🚀 Migração Supabase → Firebase Firestore');
    console.log(`   Projeto Firebase: ${serviceAccount.project_id}`);
    try {
        await migrarClientes();
        await migrarOcorrencias();
        console.log('\n🎉 Migração concluída! Verifique em https://console.firebase.google.com');
    } catch (e) {
        console.error('\n❌ Erro:', e.message);
        process.exit(1);
    }
    process.exit(0);
}

main();
