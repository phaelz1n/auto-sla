const express = require('express');
const router = express.Router();
const db = require('../config/firebase');
const { FieldPath } = require('firebase-admin/firestore');

router.get('/clientes', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Firebase não configurado. Adicione firebase-service-account.json" });
    try {
        const snapshot = await db.collection('clientes').orderBy('nome', 'asc').get();
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(data);
    } catch (e) {
        console.error('Erro no /api/clientes:', e);
        res.status(500).json({ error: e.message });
    }
});

router.get('/clientes-com-ocorrencias', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Firebase não configurado. Adicione firebase-service-account.json" });
    const { periodo } = req.query;
    if (!periodo) return res.status(400).json({ error: "Período é obrigatório" });

    try {
        // Busca todas as ocorrências cujo campo 'data' contém o período (ex: "2026-01")
        const snapshot = await db.collection('ocorrencias')
            .where('data', '>=', periodo)
            .get();

        // Filtra no lado do servidor (Firestore não tem LIKE, usamos contains manual)
        const docs = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(oc => oc.data && oc.data.includes(periodo));

        // Busca nomes dos clientes
        const clienteIds = [...new Set(docs.map(oc => oc.cliente_id).filter(Boolean))];
        const clientesMap = {};

        // Busca em lotes de até 30 (limite do Firestore para 'in')
        for (let i = 0; i < clienteIds.length; i += 30) {
            const batch = clienteIds.slice(i, i + 30);
            const clienteSnap = await db.collection('clientes')
                .where(FieldPath.documentId(), 'in', batch)
                .get();
            clienteSnap.docs.forEach(doc => {
                clientesMap[doc.id] = doc.data().nome;
            });
        }

        const result = {};
        docs.forEach(oc => {
            const cId = oc.cliente_id;
            if (!result[cId]) {
                result[cId] = {
                    id: cId,
                    nome: clientesMap[cId] || cId,
                    ocorrencias_count: 0
                };
            }
            result[cId].ocorrencias_count++;
        });

        res.json(Object.values(result).sort((a, b) => a.nome.localeCompare(b.nome)));
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
