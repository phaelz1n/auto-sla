const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

router.get('/clientes', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: "Supabase não configurado no .env" });
    try {
        const { data, error } = await supabase.from('clientes').select('*').order('nome', { ascending: true });
        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    } catch (e) {
        console.error('Erro no /api/clientes:', e);
        res.status(500).json({ error: e.message });
    }
});

router.get('/clientes-com-ocorrencias', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: "Supabase não configurado no .env" });
    const { periodo } = req.query; 
    if (!periodo) return res.status(400).json({ error: "Período é obrigatório" });

    try {
        const { data, error } = await supabase
            .from('ocorrencias')
            .select('cliente_id, clientes(nome)')
            .like('data', `%${periodo}%`);
            
        if (error) return res.status(500).json({ error: error.message });

        const clientesMap = {};
        data.forEach(oc => {
            const cId = oc.cliente_id;
            if (!clientesMap[cId]) {
                clientesMap[cId] = {
                    id: cId,
                    nome: oc.clientes.nome,
                    ocorrencias_count: 0
                };
            }
            clientesMap[cId].ocorrencias_count++;
        });
        
        res.json(Object.values(clientesMap).sort((a,b) => a.nome.localeCompare(b.nome)));
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
