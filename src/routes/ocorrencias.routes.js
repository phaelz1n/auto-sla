const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

router.get('/ocorrencias/numeros-atuais/:cliente_id', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: "Supabase não configurado no .env" });
    const { cliente_id } = req.params;
    try {
        const { data, error } = await supabase
            .from('ocorrencias')
            .select('numero_original')
            .eq('cliente_id', cliente_id);
        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    } catch (e) {
        console.error('Erro em numeros-atuais:', e);
        res.status(500).json({ error: e.message });
    }
});

router.get('/ocorrencias/:cliente_id', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: "Supabase não configurado no .env" });
    const { data, error } = await supabase.from('ocorrencias').select('*').eq('cliente_id', req.params.cliente_id).order('created_at', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

router.post('/ocorrencias/lote', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: "Supabase não configurado no .env" });
    
    const { ocorrencias } = req.body;
    if (!ocorrencias || !ocorrencias.length) return res.status(400).json({ error: "Nenhuma ocorrência enviada" });

    const hasInvalid = ocorrencias.some(o => !o.cliente_id);
    if (hasInvalid) return res.status(400).json({ error: "Todas as ocorrências precisam de um cliente associado." });

    try {
        const grouped = {};
        for (const oc of ocorrencias) {
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

        const clientIds = Object.keys(grouped).map(k => grouped[k].client);
        const { data: clientsData } = await supabase.from('clientes').select('id, nome').in('id', clientIds);
        const clientsMap = {};
        if (clientsData) {
            clientsData.forEach(c => clientsMap[c.id] = c.nome);
        }

        const getPrefix = (nome) => {
            if (!nome) return 'CLI';
            const clean = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]/g, '').toUpperCase();
            return clean.substring(0, 5) || 'CLI';
        };

        for (const key of Object.keys(grouped)) {
            const group = grouped[key];
            const nomeCliente = clientsMap[group.client] || '';
            const prefix = getPrefix(nomeCliente);
            
            const { data: existingOc, error: searchError } = await supabase
                .from('ocorrencias')
                .select('numero_original')
                .eq('cliente_id', group.client);
                
            let usedSeqs = new Set();
            if (!searchError && existingOc) {
                for (const row of existingOc) {
                    if (row.numero_original && row.numero_original.endsWith(`/${group.yearShort}`)) {
                        const m = row.numero_original.match(/(?:.*-)?(\d+)\//);
                        if (m) {
                            usedSeqs.add(parseInt(m[1], 10));
                        }
                    }
                }
            }
            
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
                while (usedSeqs.has(currentSeqCandidate)) {
                    currentSeqCandidate++;
                }
                usedSeqs.add(currentSeqCandidate);
                const seqStr = String(currentSeqCandidate).padStart(3, '0');
                item.numero_original = `${prefix}-${seqStr}/${group.yearShort}`;
            }
        }

        const { error } = await supabase.from('ocorrencias').insert(ocorrencias);
        if (error) return res.status(500).json({ error: error.message });
        res.json({ success: true, message: "Ocorrências salvas no banco com sucesso!" });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/ocorrencias/regerar-numeros', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: "Supabase não configurado no .env" });
    try {
        const { data: todasOcorrencias, error: fetchError } = await supabase
            .from('ocorrencias')
            .select('id, data, cliente_id, numero_original');
            
        if (fetchError) throw fetchError;
        if (!todasOcorrencias || todasOcorrencias.length === 0) {
            return res.json({ success: true, message: "Nenhuma ocorrência encontrada." });
        }

        const { data: clientesData } = await supabase.from('clientes').select('id, nome');
        const clientesMap = {};
        if (clientesData) clientesData.forEach(c => clientesMap[c.id] = c.nome);

        const getPrefix = (nome) => {
            if (!nome) return 'CLI';
            const clean = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]/g, '').toUpperCase();
            return clean.substring(0, 5) || 'CLI';
        };

        const grouped = {};
        for (const oc of todasOcorrencias) {
            if (!oc.data) continue;
            const match = oc.data.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
            if (!match) continue;
            const yearStr = match[3];
            const yearShort = yearStr.slice(-2);
            const client = oc.cliente_id;
            
            if (!client) continue;

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
                if (diff === 0) return a.id - b.id;
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

        let updatedCount = 0;
        for (const up of updates) {
            await supabase.from('ocorrencias').update({ numero_original: up.numero_original }).eq('id', up.id);
            updatedCount++;
        }

        res.json({ success: true, message: `Numeração regerada com sucesso para ${updatedCount} ocorrências.` });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

router.delete('/ocorrencias/:id', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: "Supabase não configurado no .env" });
    try {
        const { error } = await supabase
            .from('ocorrencias')
            .delete()
            .eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        console.error("Erro ao deletar:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
