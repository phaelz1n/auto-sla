const express = require('express');
const router = express.Router();
const db = require('../config/firebase');

/**
 * GET /api/dashboard/metrics
 * Query params opcionais:
 *   cliente_id  - filtra por cliente especifico
 *   dataInicio  - "MM/YYYY" - mes/ano de inicio
 *   dataFim     - "MM/YYYY" - mes/ano de fim
 *
 * Retorna metricas agregadas para o painel executivo,
 * incluindo distribuicao por culpado (porCulpado).
 */
router.get('/dashboard/metrics', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Firebase nao configurado." });

    try {
        const { cliente_id, dataInicio, dataFim } = req.query;

        const [ocSnap, clientesSnap] = await Promise.all([
            db.collection('ocorrencias').get(),
            db.collection('clientes').get()
        ]);

        const clientes = {};
        clientesSnap.docs.forEach(doc => {
            clientes[doc.id] = doc.data().nome;
        });

        let ocorrencias = ocSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // ── Helpers de data ──────────────────────────────────────────────────
        const parseMesAno = (str) => {
            if (!str) return null;
            const [m, y] = str.split('/');
            if (!m || !y) return null;
            return new Date(parseInt(y), parseInt(m) - 1, 1);
        };

        const extrairMesAno = (dataStr) => {
            if (!dataStr) return null;
            const match = dataStr.match(/(\d{2})\/(\d{2})\/(\d{4})/) ||
                          dataStr.match(/(\d{4})-(\d{2})-(\d{2})/);
            if (!match) return null;
            let mes, ano;
            if (match[0].includes('-')) { ano = parseInt(match[1]); mes = parseInt(match[2]); }
            else { mes = parseInt(match[2]); ano = parseInt(match[3]); }
            return new Date(ano, mes - 1, 1);
        };

        // ── Aplicar filtros ──────────────────────────────────────────────────
        if (cliente_id) {
            ocorrencias = ocorrencias.filter(oc => oc.cliente_id === cliente_id);
        }

        const inicio = parseMesAno(dataInicio);
        const fim    = parseMesAno(dataFim);

        if (inicio || fim) {
            ocorrencias = ocorrencias.filter(oc => {
                const dt = extrairMesAno(oc.data);
                if (!dt) return false;
                if (inicio && dt < inicio) return false;
                if (fim    && dt > fim)    return false;
                return true;
            });
        }

        // ── Metricas globais ─────────────────────────────────────────────────
        const totalOcorrencias = ocorrencias.length;
        const totalClientes    = Object.keys(clientes).length;

        // ── Categorias de culpado ────────────────────────────────────────────
        const porCulpado = { operacional: 0, motorista: 0, oficina: 0, cliente: 0, sem_info: 0 };
        ocorrencias.forEach(oc => {
            const c = oc.culpado;
            if (c && Object.prototype.hasOwnProperty.call(porCulpado, c)) {
                porCulpado[c]++;
            } else {
                porCulpado.sem_info++;
            }
        });

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
                    porAno: {},
                    porCulpado: { operacional: 0, motorista: 0, oficina: 0, cliente: 0, sem_info: 0 }
                };
            }
            porCliente[cid].total++;

            const c = oc.culpado;
            if (c && Object.prototype.hasOwnProperty.call(porCliente[cid].porCulpado, c)) {
                porCliente[cid].porCulpado[c]++;
            } else {
                porCliente[cid].porCulpado.sem_info++;
            }

            if (oc.data) {
                const match = oc.data.match(/(\d{2})\/(\d{2})\/(\d{4})/) ||
                              oc.data.match(/(\d{4})-(\d{2})-(\d{2})/);
                if (match) {
                    let mes, ano;
                    if (match[0].includes('-')) { ano = match[1]; mes = match[2]; }
                    else { mes = match[2]; ano = match[3]; }
                    const chave = mes + '/' + ano;
                    porCliente[cid].porMes[chave] = (porCliente[cid].porMes[chave] || 0) + 1;
                    porCliente[cid].porAno[ano]   = (porCliente[cid].porAno[ano]   || 0) + 1;
                }
            }
        });

        // ── Serie temporal global ────────────────────────────────────────────
        const serieTemporal = {};
        const serieTemporalCulpado = {};

        ocorrencias.forEach(oc => {
            if (!oc.data) return;
            const match = oc.data.match(/(\d{2})\/(\d{2})\/(\d{4})/) ||
                          oc.data.match(/(\d{4})-(\d{2})-(\d{2})/);
            if (!match) return;
            let mes, ano;
            if (match[0].includes('-')) { ano = match[1]; mes = match[2]; }
            else { mes = match[2]; ano = match[3]; }
            const chave = ano + '-' + mes;

            serieTemporal[chave] = (serieTemporal[chave] || 0) + 1;

            if (!serieTemporalCulpado[chave]) {
                serieTemporalCulpado[chave] = { operacional: 0, motorista: 0, oficina: 0, cliente: 0, sem_info: 0 };
            }
            const c = oc.culpado;
            if (c && Object.prototype.hasOwnProperty.call(serieTemporalCulpado[chave], c)) {
                serieTemporalCulpado[chave][c]++;
            } else {
                serieTemporalCulpado[chave].sem_info++;
            }
        });

        const serieOrdenada = Object.entries(serieTemporal)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([chave, total]) => {
                const parts = chave.split('-');
                const ano = parts[0];
                const mes = parts[1];
                return {
                    label: mes + '/' + ano,
                    total,
                    porCulpado: serieTemporalCulpado[chave] || {}
                };
            });

        // ── Ranking de clientes (top 10) ─────────────────────────────────────
        const rankingClientes = Object.values(porCliente)
            .sort((a, b) => b.total - a.total)
            .slice(0, 10)
            .map(c => ({ nome: c.nome, total: c.total }));

        // ── Evolucao mensal por cliente (para heatmap) ───────────────────────
        const evolucaoPorCliente = Object.values(porCliente).map(c => ({
            id: c.id,
            nome: c.nome,
            total: c.total,
            porMes: c.porMes,
            porAno: c.porAno,
            porCulpado: c.porCulpado
        }));

        // ── Mes com mais ocorrencias ──────────────────────────────────────────
        let mesPico = { label: '-', total: 0 };
        serieOrdenada.forEach(s => { if (s.total > mesPico.total) mesPico = s; });

        // ── Cliente com mais ocorrencias ─────────────────────────────────────
        const clienteTop = rankingClientes[0] || { nome: '-', total: 0 };

        // ── Media de ocorrencias por cliente ─────────────────────────────────
        const mediaOcPorCliente = totalClientes > 0
            ? (totalOcorrencias / totalClientes).toFixed(1)
            : 0;

        // ── Anos disponiveis ──────────────────────────────────────────────────
        const anosSet = new Set();
        ocorrencias.forEach(oc => {
            if (!oc.data) return;
            const m = oc.data.match(/\d{4}/);
            if (m) anosSet.add(m[0]);
        });
        const anos = Array.from(anosSet).sort();

        // ── Lista de clientes (para filtros) ──────────────────────────────────
        const listaClientes = clientesSnap.docs.map(doc => ({
            id: doc.id,
            nome: doc.data().nome
        })).sort((a, b) => a.nome.localeCompare(b.nome));

        res.json({
            totalOcorrencias,
            totalClientes,
            mediaOcPorCliente,
            mesPico,
            clienteTop,
            rankingClientes,
            serieTemporalGlobal: serieOrdenada,
            evolucaoPorCliente,
            anos,
            porCulpado,
            listaClientes
        });

    } catch (e) {
        console.error('Erro em /dashboard/metrics:', e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
