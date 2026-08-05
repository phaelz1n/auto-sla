const express = require('express');
const router = express.Router();
const db = require('../config/firebase');
const { FieldPath, FieldValue } = require('firebase-admin/firestore');

// ─── Helper: busca nome do cliente pelo ID ────────────────────────────────────
async function getClienteNome(cliente_id) {
    try {
        const doc = await db.collection('clientes').doc(String(cliente_id)).get();
        return doc.exists ? doc.data().nome : '';
    } catch {
        return '';
    }
}

// ─── Helper: prefixo do número de ocorrência ─────────────────────────────────
const getPrefix = (nome) => {
    if (!nome) return 'CLI';
    const clean = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return clean.substring(0, 5) || 'CLI';
};

// ─── GET: números existentes de um cliente ───────────────────────────────────
router.get('/ocorrencias/numeros-atuais/:cliente_id', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Firebase não configurado. Adicione firebase-service-account.json" });
    const { cliente_id } = req.params;
    try {
        const snapshot = await db.collection('ocorrencias')
            .where('cliente_id', '==', cliente_id)
            .get();
        const data = snapshot.docs.map(doc => ({ numero_original: doc.data().numero_original }));
        res.json(data);
    } catch (e) {
        console.error('Erro em numeros-atuais:', e);
        res.status(500).json({ error: e.message });
    }
});

// ─── GET: todas as ocorrências de um cliente ─────────────────────────────────
router.get('/ocorrencias/:cliente_id', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Firebase não configurado. Adicione firebase-service-account.json" });
    try {
        const snapshot = await db.collection('ocorrencias')
            .where('cliente_id', '==', req.params.cliente_id)
            .get();
        const data = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            // Ordena por created_at em memória (evita precisar de índice composto no Firestore)
            .sort((a, b) => {
                const ta = a.created_at?.toMillis?.() ?? 0;
                const tb = b.created_at?.toMillis?.() ?? 0;
                return ta - tb;
            });
        res.json(data);
    } catch (e) {
        console.error('Erro em /ocorrencias/:cliente_id:', e);
        res.status(500).json({ error: e.message });
    }
});


// ─── POST: inserção em lote ───────────────────────────────────────────────────
router.post('/ocorrencias/lote', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Firebase não configurado. Adicione firebase-service-account.json" });

    const { ocorrencias } = req.body;
    if (!ocorrencias || !ocorrencias.length) return res.status(400).json({ error: "Nenhuma ocorrência enviada" });

    const hasInvalid = ocorrencias.some(o => !o.cliente_id);
    if (hasInvalid) return res.status(400).json({ error: "Todas as ocorrências precisam de um cliente associado." });

    try {
        // Busca nomes dos clientes envolvidos
        const clientIdsArray = [...new Set(ocorrencias.map(o => o.cliente_id).filter(id => id))];
        const clientsMap = {};
        for (let i = 0; i < clientIdsArray.length; i += 30) {
            const batch = clientIdsArray.slice(i, i + 30);
            const snap = await db.collection('clientes')
                .where(FieldPath.documentId(), 'in', batch)
                .get();
            snap.docs.forEach(doc => { clientsMap[doc.id] = doc.data().nome; });
        }

        const grouped = {};
        for (const oc of ocorrencias) {
            const nomeCliente = clientsMap[oc.cliente_id] || '';
            if (nomeCliente.toUpperCase().includes('PERTO')) {
                // Se o usuário preencheu um número customizado (ex: 062/2026) que não é o nosso padrão, preserva
                if (oc.numero_original && !String(oc.numero_original).toUpperCase().startsWith('PERTO-')) {
                    continue;
                }
            }

            if (!oc.data) continue;
            const match = oc.data.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
            if (!match) continue;
            const yearStr = match[3];
            const yearShort = yearStr.slice(-2);
            const client = oc.cliente_id;

            const key = `${client}_${yearShort}`;
            if (!grouped[key]) {
                grouped[key] = { client, yearShort, yearStr, items: [] };
            }
            grouped[key].items.push(oc);
        }

        for (const key of Object.keys(grouped)) {
            const group = grouped[key];
            const nomeCliente = clientsMap[group.client] || '';
            const prefix = getPrefix(nomeCliente);

            // Busca numerações já existentes para esse cliente
            const existingSnap = await db.collection('ocorrencias')
                .where('cliente_id', '==', group.client)
                .get();

            let usedSeqs = new Set();
            existingSnap.docs.forEach(doc => {
                const row = doc.data();
                if (row.numero_original && row.numero_original.endsWith(`/${group.yearShort}`)) {
                    const m = row.numero_original.match(/(?:.*-)?(\d+)\//);
                    if (m) usedSeqs.add(parseInt(m[1], 10));
                }
            });

            group.items.sort((a, b) => {
                const parseDate = (str) => {
                    const parts = str.split(/[\/\-]/);
                    if (parts.length === 3) return parseInt(parts[2] + parts[1] + parts[0], 10);
                    return 0;
                };
                return parseDate(a.data) - parseDate(b.data);
            });

            let currentSeqCandidate = 1;
            for (const item of group.items) {
                while (usedSeqs.has(currentSeqCandidate)) currentSeqCandidate++;
                usedSeqs.add(currentSeqCandidate);
                const seqStr = String(currentSeqCandidate).padStart(3, '0');
                item.numero_original = `${prefix}-${seqStr}/${group.yearShort}`;
            }
        }

        // Insere em batch no Firestore (máx 500 por batch)
        const BATCH_SIZE = 500;
        for (let i = 0; i < ocorrencias.length; i += BATCH_SIZE) {
            const batch = db.batch();
            const slice = ocorrencias.slice(i, i + BATCH_SIZE);
            slice.forEach(oc => {
                const ref = db.collection('ocorrencias').doc();
                batch.set(ref, {
                    ...oc,
                    created_at: FieldValue.serverTimestamp()
                });
            });
            await batch.commit();
        }

        res.json({ success: true, message: "Ocorrências salvas no banco com sucesso!" });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// ─── POST: regeração de números ───────────────────────────────────────────────
router.post('/ocorrencias/regerar-numeros', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Firebase não configurado. Adicione firebase-service-account.json" });
    try {
        const [ocSnap, clientesSnap] = await Promise.all([
            db.collection('ocorrencias').get(),
            db.collection('clientes').get()
        ]);

        const todasOcorrencias = ocSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (!todasOcorrencias.length) {
            return res.json({ success: true, message: "Nenhuma ocorrência encontrada." });
        }

        const clientesMap = {};
        clientesSnap.docs.forEach(doc => { clientesMap[doc.id] = doc.data().nome; });

        const grouped = {};
        for (const oc of todasOcorrencias) {
            if (!oc.data) continue;
            const match = oc.data.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
            if (!match) continue;
            const yearStr = match[3];
            const yearShort = yearStr.slice(-2);
            const client = oc.cliente_id;
            if (!client) continue;

            const nomeCliente = clientesMap[client] || '';
            if (nomeCliente.toUpperCase().includes('PERTO')) {
                if (oc.numero_original && !String(oc.numero_original).toUpperCase().startsWith('PERTO-')) {
                    continue;
                }
            }

            const key = `${client}_${yearShort}`;
            if (!grouped[key]) grouped[key] = { items: [] };
            grouped[key].items.push(oc);
        }

        const updates = [];
        for (const key of Object.keys(grouped)) {
            const group = grouped[key];
            const yearShort = key.split('_')[1];
            const client = group.items[0].cliente_id;
            const nomeCliente = clientesMap[client] || '';
            const prefix = getPrefix(nomeCliente);

            group.items.sort((a, b) => {
                const parseDate = (str) => {
                    const parts = str.split(/[\/\-]/);
                    if (parts.length === 3) return parseInt(parts[2] + parts[1] + parts[0], 10);
                    return 0;
                };
                const diff = parseDate(a.data) - parseDate(b.data);
                if (diff === 0) return (a.id > b.id ? 1 : -1);
                return diff;
            });

            let seq = 0;
            for (const item of group.items) {
                seq++;
                const seqStr = String(seq).padStart(3, '0');
                const novoNumero = `${prefix}-${seqStr}/${yearShort}`;
                if (item.numero_original !== novoNumero) {
                    updates.push({ id: item.id, numero_original: novoNumero });
                }
            }
        }

        // Atualiza em batches
        const BATCH_SIZE = 500;
        for (let i = 0; i < updates.length; i += BATCH_SIZE) {
            const batch = db.batch();
            updates.slice(i, i + BATCH_SIZE).forEach(up => {
                const ref = db.collection('ocorrencias').doc(up.id);
                batch.update(ref, { numero_original: up.numero_original });
            });
            await batch.commit();
        }

        res.json({ success: true, message: `Numeração regerada com sucesso para ${updates.length} ocorrências.` });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// ─── DELETE: deletar ocorrência ───────────────────────────────────────────────
router.delete('/ocorrencias/:id', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Firebase não configurado. Adicione firebase-service-account.json" });
    try {
        await db.collection('ocorrencias').doc(req.params.id).delete();
        res.json({ success: true });
    } catch (err) {
        console.error("Erro ao deletar:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
