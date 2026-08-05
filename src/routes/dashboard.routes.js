const express = require('express');
const router = express.Router();
const db = require('../config/firebase');

/**
 * GET /api/dashboard/metrics
 * Retorna métricas agregadas de todos os clientes para o painel executivo.
 */
router.get('/dashboard/metrics', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Firebase não configurado." });

    try {
        const [ocSnap, clientesSnap] = await Promise.all([
            db.collection('ocorrencias').get(),
            db.collection('clientes').get()
        ]);

        const clientes = {};
        clientesSnap.docs.forEach(doc => {
            clientes[doc.id] = doc.data().nome;
        });

        const ocorrencias = ocSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // ── Métricas globais ─────────────────────────────────────────────────
        const totalOcorrencias = ocorrencias.length;
        const totalClientes = Object.keys(clientes).length;

        // ── Por cliente ──────────────────────────────────────────────────────
        const porCliente = {};
        ocorrencias.forEach(oc => {
            const cid = oc.cliente_id;
            if (!cid) return;
            if (!porCliente[cid]) {
                porCliente[cid] = {
                    id: cid,
                    nome: clientes[cid] || cid,
                    total: 0,
                    porMes: {},
                    porAno: {}
                };
            }
            porCliente[cid].total++;

            if (oc.data) {
                // Tenta extrair mês/ano  ex: "15/08/2026" ou "2026-08-15"
                const match = oc.data.match(/(\d{2})\/(\d{2})\/(\d{4})/) ||
                              oc.data.match(/(\d{4})-(\d{2})-(\d{2})/);
                if (match) {
                    let mes, ano;
                    if (match[0].includes('-')) {
                        // formato ISO
                        ano = match[1]; mes = match[2];
                    } else {
                        mes = match[2]; ano = match[3];
                    }
                    const chave = `${mes}/${ano}`;
                    const chaveAno = ano;
                    porCliente[cid].porMes[chave] = (porCliente[cid].porMes[chave] || 0) + 1;
                    porCliente[cid].porAno[chaveAno] = (porCliente[cid].porAno[chaveAno] || 0) + 1;
                }
            }
        });

        // ── Série temporal global (todos os clientes) ────────────────────────
        const serieTemporal = {};
        ocorrencias.forEach(oc => {
            if (!oc.data) return;
            const match = oc.data.match(/(\d{2})\/(\d{2})\/(\d{4})/) ||
                          oc.data.match(/(\d{4})-(\d{2})-(\d{2})/);
            if (!match) return;
            let mes, ano;
            if (match[0].includes('-')) { ano = match[1]; mes = match[2]; }
            else { mes = match[2]; ano = match[3]; }
            const chave = `${ano}-${mes}`;
            serieTemporal[chave] = (serieTemporal[chave] || 0) + 1;
        });

        // ordena por data
        const serieOrdenada = Object.entries(serieTemporal)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([chave, total]) => {
                const [ano, mes] = chave.split('-');
                return { label: `${mes}/${ano}`, total };
            });

        // ── Ranking de clientes (top 10) ─────────────────────────────────────
        const rankingClientes = Object.values(porCliente)
            .sort((a, b) => b.total - a.total)
            .slice(0, 10)
            .map(c => ({ nome: c.nome, total: c.total }));

        // ── Evolução mensal por cliente (para heatmap) ───────────────────────
        const evolucaoPorCliente = Object.values(porCliente).map(c => ({
            id: c.id,
            nome: c.nome,
            total: c.total,
            porMes: c.porMes,
            porAno: c.porAno
        }));

        // ── Mês com mais ocorrências ──────────────────────────────────────────
        let mesPico = { label: '-', total: 0 };
        serieOrdenada.forEach(s => {
            if (s.total > mesPico.total) mesPico = s;
        });

        // ── Cliente com mais ocorrências ─────────────────────────────────────
        const clienteTop = rankingClientes[0] || { nome: '-', total: 0 };

        // ── Média de ocorrências por cliente ─────────────────────────────────
        const mediaOcPorCliente = totalClientes > 0
            ? (totalOcorrencias / totalClientes).toFixed(1)
            : 0;

        // ── Anos disponíveis ──────────────────────────────────────────────────
        const anosSet = new Set();
        ocorrencias.forEach(oc => {
            if (!oc.data) return;
            const m = oc.data.match(/\d{4}/);
            if (m) anosSet.add(m[0]);
        });
        const anos = Array.from(anosSet).sort();

        res.json({
            totalOcorrencias,
            totalClientes,
            mediaOcPorCliente,
            mesPico,
            clienteTop,
            rankingClientes,
            serieTemporalGlobal: serieOrdenada,
            evolucaoPorCliente,
            anos
        });

    } catch (e) {
        console.error('Erro em /dashboard/metrics:', e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
