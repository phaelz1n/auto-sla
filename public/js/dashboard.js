/* ======================================================================
   dashboard.js  -  Auto SLA | Painel Executivo
   Consome GET /api/dashboard/metrics e renderiza todos os graficos
   Suporta filtros por cliente e periodo + exportacao PDF
   ====================================================================== */

(function () {
    'use strict';

    /* ── Estado ─────────────────────────────────────────────────── */
    let metricsData   = null;
    let chartInstances = {};
    let activeFilters  = { cliente_id: '', dataInicio: '', dataFim: '' };

    /* ── Utilitarios ────────────────────────────────────────────── */
    const $ = id => document.getElementById(id);
    const fmt = n => Number(n).toLocaleString('pt-BR');

    function destroyChart(key) {
        if (chartInstances[key]) {
            chartInstances[key].destroy();
            delete chartInstances[key];
        }
    }

    /* ── Paletas ────────────────────────────────────────────────── */
    const PALETTE = [
        '#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
        '#ef4444', '#ec4899', '#14b8a6', '#f97316', '#84cc16',
        '#3b82f6', '#a855f7', '#22d3ee', '#34d399', '#fbbf24'
    ];
    function palette(i) { return PALETTE[i % PALETTE.length]; }

    /* Cores e labels das categorias de culpa */
    const CULPA_CONFIG = {
        operacional: { label: 'Setor Operacional', color: '#f97316', emoji: '🔧' },
        motorista:   { label: 'Motorista',          color: '#06b6d4', emoji: '🚗' },
        oficina:     { label: 'Oficina',             color: '#8b5cf6', emoji: '🏭' },
        cliente:     { label: 'Erro do Cliente',     color: '#10b981', emoji: '👤' },
        fator_externo: { label: 'Fator Externo',   color: '#eab308', emoji: '🌩️' },
        chapeacao:   { label: 'Chapeação',         color: '#ec4899', emoji: '🔨' },
        sem_info:    { label: 'Sem Informacao',      color: '#94a3b8', emoji: '❓' }
    };

    /* ── Carregar dados ──────────────────────────────────────────── */
    async function loadMetrics() {
        showSkeleton(true);
        $('dash-error').classList.add('hidden');

        const params = new URLSearchParams();
        if (activeFilters.cliente_id) params.set('cliente_id', activeFilters.cliente_id);
        if (activeFilters.dataInicio) params.set('dataInicio', activeFilters.dataInicio);
        if (activeFilters.dataFim)    params.set('dataFim',    activeFilters.dataFim);

        const qs = params.toString() ? '?' + params.toString() : '';

        try {
            const res = await fetch('/api/dashboard/metrics' + qs);
            if (!res.ok) throw new Error(await res.text());
            metricsData = await res.json();
            populateClienteFilter();
            updateFiltrosAtivos();
            renderAll();
        } catch (e) {
            $('dash-error').textContent = 'Erro ao carregar metricas: ' + e.message;
            $('dash-error').classList.remove('hidden');
        } finally {
            showSkeleton(false);
        }
    }

    function showSkeleton(show) {
        document.querySelectorAll('.dash-skeleton').forEach(el => el.classList.toggle('hidden', !show));
        document.querySelectorAll('.dash-content').forEach(el => el.classList.toggle('hidden', show));
    }

    /* ── Popular select de cliente nos filtros ───────────────────── */
    function populateClienteFilter() {
        const sel = $('filter-cliente');
        if (!sel || !metricsData.listaClientes) return;
        const current = sel.value;
        sel.innerHTML = '<option value="">Todos os clientes</option>';
        metricsData.listaClientes.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.nome;
            if (c.id === current) opt.selected = true;
            sel.appendChild(opt);
        });
    }

    /* ── Exibir filtros ativos ───────────────────────────────────── */
    function updateFiltrosAtivos() {
        const el = $('filtros-ativos');
        if (!el) return;
        const parts = [];
        if (activeFilters.cliente_id && metricsData.listaClientes) {
            const c = metricsData.listaClientes.find(x => x.id === activeFilters.cliente_id);
            if (c) parts.push('Cliente: <strong>' + c.nome + '</strong>');
        }
        if (activeFilters.dataInicio) parts.push('De: <strong>' + activeFilters.dataInicio + '</strong>');
        if (activeFilters.dataFim)    parts.push('Ate: <strong>' + activeFilters.dataFim + '</strong>');
        el.innerHTML = parts.length ? parts.join(' &nbsp;|&nbsp; ') : 'Nenhum filtro aplicado';
    }

    /* ── Aplicar / Limpar filtros ────────────────────────────────── */
    window.applyFilters = function () {
        activeFilters.cliente_id = $('filter-cliente')?.value || '';
        activeFilters.dataInicio = $('filter-inicio')?.value  || '';
        activeFilters.dataFim    = $('filter-fim')?.value     || '';
        loadMetrics();
    };

    window.clearFilters = function () {
        activeFilters = { cliente_id: '', dataInicio: '', dataFim: '' };
        if ($('filter-cliente')) $('filter-cliente').value = '';
        if ($('filter-inicio'))  $('filter-inicio').value  = '';
        if ($('filter-fim'))     $('filter-fim').value     = '';
        loadMetrics();
    };

    /* ── Renderizacao completa ───────────────────────────────────── */
    function renderAll() {
        renderKPIs();
        renderLineChart();
        renderBarChart();
        renderDonutChart();
        renderCulpabilidadeKPIs();
        renderCulpabilidadeDonut();
        renderCulpabilidadeStacked();
        renderHeatTable();
        renderRankingTable();
        renderYearSelect();
    }

    /* ── KPI Cards ───────────────────────────────────────────────── */
    function renderKPIs() {
        const d = metricsData;
        $('kpi-total').textContent       = fmt(d.totalOcorrencias);
        $('kpi-clientes').textContent    = fmt(d.totalClientes);
        $('kpi-media').textContent       = d.mediaOcPorCliente;
        $('kpi-mes-pico').textContent    = d.mesPico.label;
        $('kpi-mes-pico-val').textContent = fmt(d.mesPico.total) + ' oc.';
        $('kpi-top-cliente').textContent  = d.clienteTop.nome || '-';
        $('kpi-top-val').textContent      = fmt(d.clienteTop.total) + ' oc.';
    }

    /* ── KPIs de Culpabilidade ───────────────────────────────────── */
    function renderCulpabilidadeKPIs() {
        const pc = metricsData.porCulpado || {};
        const total = metricsData.totalOcorrencias || 1;

        Object.keys(CULPA_CONFIG).forEach(key => {
            const val  = pc[key] || 0;
            const pct  = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
            const vEl  = $(('kpi-culpa-' + key).replace('sem_info', 'sem'));
            const pEl  = $(('kpi-culpa-' + key + '-pct').replace('sem_info', 'sem'));
            if (vEl)  vEl.textContent = fmt(val);
            if (pEl)  pEl.textContent = pct + '% do total';
        });
    }

    /* ── Grafico de Rosca – Culpabilidade ───────────────────────── */
    function renderCulpabilidadeDonut() {
        destroyChart('culpa-donut');
        const pc = metricsData.porCulpado || {};
        const keys = Object.keys(CULPA_CONFIG);
        const labels = keys.map(k => CULPA_CONFIG[k].label);
        const data   = keys.map(k => pc[k] || 0);
        const colors = keys.map(k => CULPA_CONFIG[k].color);

        const ctx = $('chart-culpa-donut')?.getContext('2d');
        if (!ctx) return;

        chartInstances['culpa-donut'] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: colors.map(c => c + 'cc'),
                    borderColor: '#0f172a',
                    borderWidth: 2,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: '#cbd5e1', font: { size: 11 },
                            boxWidth: 12, padding: 10
                        }
                    },
                    tooltip: {
                        backgroundColor: '#1e1b4b',
                        titleColor: '#a5b4fc',
                        bodyColor: '#e0e7ff',
                        padding: 10,
                        callbacks: {
                            label: ctx => {
                                const ttl = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = ttl > 0 ? ((ctx.parsed / ttl) * 100).toFixed(1) : '0.0';
                                return ' ' + fmt(ctx.parsed) + ' oc. (' + pct + '%)';
                            }
                        }
                    }
                }
            }
        });
    }

    /* ── Grafico de Barras Empilhadas – Culpa por Mes ────────────── */
    function renderCulpabilidadeStacked() {
        destroyChart('culpa-stacked');
        const serie = metricsData.serieTemporalGlobal || [];
        const labels = serie.map(p => p.label);
        const keys   = ['operacional', 'motorista', 'oficina', 'cliente', 'sem_info'];

        const datasets = keys.map(key => ({
            label: CULPA_CONFIG[key].label,
            data: serie.map(p => (p.porCulpado && p.porCulpado[key]) || 0),
            backgroundColor: CULPA_CONFIG[key].color + 'cc',
            borderColor: CULPA_CONFIG[key].color,
            borderWidth: 1,
            borderRadius: 4,
            stack: 'stack0'
        }));

        const ctx = $('chart-culpa-stacked')?.getContext('2d');
        if (!ctx) return;

        chartInstances['culpa-stacked'] = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#cbd5e1', font: { size: 10 }, boxWidth: 12, padding: 8 }
                    },
                    tooltip: {
                        backgroundColor: '#1e1b4b',
                        titleColor: '#a5b4fc',
                        bodyColor: '#e0e7ff',
                        padding: 10,
                        callbacks: {
                            label: ctx => ' ' + CULPA_CONFIG[keys[ctx.datasetIndex]]?.emoji + ' ' + fmt(ctx.parsed.y) + ' oc.'
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: { color: 'rgba(99,102,241,0.07)' },
                        ticks: { color: '#94a3b8', font: { size: 10 } }
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        grid: { color: 'rgba(99,102,241,0.07)' },
                        ticks: { color: '#94a3b8', font: { size: 10 }, precision: 0 }
                    }
                }
            }
        });
    }

    /* ── Grafico de Linha – Evolucao Global ─────────────────────── */
    function renderLineChart() {
        destroyChart('line');
        const d = metricsData.serieTemporalGlobal;
        const ctx = $('chart-line').getContext('2d');

        chartInstances['line'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: d.map(p => p.label),
                datasets: [{
                    label: 'Ocorrencias',
                    data: d.map(p => p.total),
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99,102,241,0.12)',
                    borderWidth: 2.5,
                    pointBackgroundColor: '#6366f1',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1e1b4b',
                        titleColor: '#a5b4fc',
                        bodyColor: '#e0e7ff',
                        padding: 10,
                        callbacks: { label: ctx => ' ' + fmt(ctx.parsed.y) + ' ocorrencias' }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(99,102,241,0.07)' },
                        ticks: { color: '#94a3b8', font: { size: 11 } }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(99,102,241,0.07)' },
                        ticks: { color: '#94a3b8', font: { size: 11 }, precision: 0 }
                    }
                }
            }
        });
    }

    /* ── Grafico de Barras – Ranking de Clientes ────────────────── */
    function renderBarChart() {
        destroyChart('bar');
        const d = metricsData.rankingClientes;
        const ctx = $('chart-bar').getContext('2d');

        chartInstances['bar'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: d.map(c => c.nome),
                datasets: [{
                    label: 'Total de Ocorrencias',
                    data: d.map(c => c.total),
                    backgroundColor: d.map((_, i) => palette(i) + 'cc'),
                    borderColor: d.map((_, i) => palette(i)),
                    borderWidth: 1.5,
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1e1b4b',
                        titleColor: '#a5b4fc',
                        bodyColor: '#e0e7ff',
                        padding: 10,
                        callbacks: { label: ctx => ' ' + fmt(ctx.parsed.x) + ' ocorrencias' }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: { color: 'rgba(99,102,241,0.07)' },
                        ticks: { color: '#94a3b8', font: { size: 11 }, precision: 0 }
                    },
                    y: {
                        grid: { display: false },
                        ticks: {
                            color: '#cbd5e1',
                            font: { size: 11 },
                            callback: function (val, idx) {
                                const label = this.getLabelForValue(val);
                                return label.length > 18 ? label.slice(0, 16) + '\u2026' : label;
                            }
                        }
                    }
                }
            }
        });
    }

    /* ── Grafico de Rosca – Distribuicao por Cliente ────────────── */
    function renderDonutChart() {
        destroyChart('donut');
        const d = metricsData.rankingClientes;
        const ctx = $('chart-donut').getContext('2d');

        chartInstances['donut'] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: d.map(c => c.nome),
                datasets: [{
                    data: d.map(c => c.total),
                    backgroundColor: d.map((_, i) => palette(i) + 'cc'),
                    borderColor: '#0f172a',
                    borderWidth: 2,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: '#cbd5e1', font: { size: 11 }, boxWidth: 12, padding: 10,
                            generateLabels: function (chart) {
                                const data = chart.data;
                                return data.labels.map((label, i) => ({
                                    text: label.length > 15 ? label.slice(0, 13) + '\u2026' : label,
                                    fillStyle: data.datasets[0].backgroundColor[i],
                                    strokeStyle: data.datasets[0].borderColor,
                                    lineWidth: 1,
                                    index: i
                                }));
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: '#1e1b4b',
                        titleColor: '#a5b4fc',
                        bodyColor: '#e0e7ff',
                        padding: 10,
                        callbacks: {
                            label: ctx => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = ((ctx.parsed / total) * 100).toFixed(1);
                                return ' ' + fmt(ctx.parsed) + ' oc. (' + pct + '%)';
                            }
                        }
                    }
                }
            }
        });
    }

    /* ── Tabela de Calor ─────────────────────────────────────────── */
    function renderHeatTable(anoFiltro) {
        const container = $('heat-table-wrap');
        container.innerHTML = '';

        const clientes = metricsData.evolucaoPorCliente;
        const mesesSet = new Set();
        clientes.forEach(c => Object.keys(c.porMes).forEach(m => mesesSet.add(m)));

        let meses = Array.from(mesesSet).sort((a, b) => {
            const [ma, ya] = a.split('/');
            const [mb, yb] = b.split('/');
            return new Date(ya, ma - 1) - new Date(yb, mb - 1);
        });

        if (anoFiltro && anoFiltro !== 'todos') {
            meses = meses.filter(m => m.endsWith('/' + anoFiltro));
        }

        if (!meses.length) {
            container.innerHTML = '<p class="text-slate-500 text-sm text-center py-6">Sem dados para o periodo selecionado.</p>';
            return;
        }

        let maxVal = 0;
        clientes.forEach(c => meses.forEach(m => {
            if ((c.porMes[m] || 0) > maxVal) maxVal = c.porMes[m];
        }));

        const heatColor = v => {
            if (!v) return 'rgba(30,27,75,0.3)';
            const ratio = v / maxVal;
            const r = Math.round(99  + ratio * (239 - 99));
            const g = Math.round(102 + ratio * (68  - 102));
            const b = Math.round(241 + ratio * (68  - 241));
            return 'rgba(' + r + ',' + g + ',' + b + ',' + (0.3 + ratio * 0.7) + ')';
        };

        const table = document.createElement('table');
        table.className = 'heat-table w-full text-xs text-center border-collapse';

        const thead = table.createTHead();
        const trHead = thead.insertRow();
        const thCliente = document.createElement('th');
        thCliente.textContent = 'Cliente';
        thCliente.className = 'heat-th sticky left-0 text-left text-slate-300 font-semibold py-2 px-3 min-w-[140px] z-10';
        trHead.appendChild(thCliente);
        meses.forEach(m => {
            const th = document.createElement('th');
            th.textContent = m;
            th.className = 'heat-th text-slate-400 font-medium py-2 px-2 min-w-[72px]';
            trHead.appendChild(th);
        });

        const tbody = table.createTBody();
        clientes
            .sort((a, b) => b.total - a.total)
            .forEach((c, ri) => {
                const tr = tbody.insertRow();
                tr.className = ri % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-800/20';

                const tdNome = tr.insertCell();
                tdNome.textContent = c.nome;
                tdNome.className = 'sticky left-0 text-left text-slate-200 font-medium py-2 px-3 truncate max-w-[140px] bg-inherit z-10';
                tdNome.title = c.nome;

                meses.forEach(m => {
                    const val = c.porMes[m] || 0;
                    const td  = tr.insertCell();
                    td.className = 'py-1.5 px-2 font-semibold transition-all cursor-default';
                    td.style.background = heatColor(val);
                    td.style.color = val ? '#f1f5f9' : '#475569';
                    td.textContent = val || '\u00b7';
                    td.title = c.nome + ' - ' + m + ': ' + val + ' ocorrencias';
                });
            });

        container.appendChild(table);
    }

    /* ── Tabela de Ranking ───────────────────────────────────────── */
    function renderRankingTable() {
        const tbody = $('ranking-tbody');
        tbody.innerHTML = '';
        const total = metricsData.totalOcorrencias;

        metricsData.evolucaoPorCliente
            .sort((a, b) => b.total - a.total)
            .forEach((c, i) => {
                const pct = total > 0 ? ((c.total / total) * 100).toFixed(1) : '0.0';
                const anos = Object.entries(c.porAno)
                    .sort(([a], [b]) => b.localeCompare(a))
                    .map(([ano, qtd]) => '<span class="inline-block px-1.5 py-0.5 rounded text-xs bg-indigo-900/60 text-indigo-300 mr-1">' + ano + ': ' + fmt(qtd) + '</span>')
                    .join('');

                const tr = document.createElement('tr');
                tr.className = i % 2 === 0 ? 'bg-slate-900/40 hover:bg-slate-800/60 transition-colors' : 'bg-slate-800/20 hover:bg-slate-800/60 transition-colors';
                tr.innerHTML =
                    '<td class="py-3 px-4 text-slate-400 font-mono font-bold text-center">' + (i + 1) + '</td>' +
                    '<td class="py-3 px-4 text-slate-100 font-semibold">' + c.nome + '</td>' +
                    '<td class="py-3 px-4 text-indigo-300 font-bold text-center text-lg">' + fmt(c.total) + '</td>' +
                    '<td class="py-3 px-4">' +
                        '<div class="flex items-center gap-2">' +
                            '<span class="text-slate-300 text-sm w-10 text-right">' + pct + '%</span>' +
                            '<div class="flex-1 bg-slate-700 rounded-full h-2"><div class="bg-gradient-to-r from-indigo-500 to-violet-500 h-2 rounded-full transition-all" style="width:' + pct + '%"></div></div>' +
                        '</div>' +
                    '</td>' +
                    '<td class="py-3 px-4">' + anos + '</td>';
                tbody.appendChild(tr);
            });
    }

    /* ── Seletor de Ano (Heatmap) ───────────────────────────────── */
    function renderYearSelect() {
        const select = $('heat-year-select');
        if (!select) return;
        select.innerHTML = '<option value="todos">Todos os anos</option>';
        (metricsData.anos || []).sort((a, b) => b.localeCompare(a)).forEach(ano => {
            const opt = document.createElement('option');
            opt.value = ano;
            opt.textContent = ano;
            select.appendChild(opt);
        });
        select.addEventListener('change', () => renderHeatTable(select.value));
        renderHeatTable(select.value);
    }

    /* ── Init ────────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', () => {
        $('dash-refresh-btn')?.addEventListener('click', loadMetrics);

        // Mascara simples para campos de mes/ano
        ['filter-inicio', 'filter-fim'].forEach(id => {
            const el = $(id);
            if (!el) return;
            el.addEventListener('input', function () {
                let v = this.value.replace(/\D/g, '');
                if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2, 6);
                this.value = v;
            });
        });

        loadMetrics();
    });

})();
