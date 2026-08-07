'use strict';

const db = require('../config/firebase');

/* ══════════════════════════════════════════════════════════════════
   gerarSLAHtml  –  Retorna um HTML completo pronto para impressão
   ══════════════════════════════════════════════════════════════════ */
async function gerarSLAHtml(cliente_id, periodo, rotasMensais) {
    if (!db) throw new Error('Firebase não configurado.');

    /* ── Cliente ────────────────────────────────────────────────── */
    const clienteDoc = await db.collection('clientes').doc(String(cliente_id)).get();
    const nome_cliente = clienteDoc.exists ? clienteDoc.data().nome : 'Cliente Desconhecido';

    /* ── Período ────────────────────────────────────────────────── */
    const isRange = periodo.includes('-');
    let mesInicial, anoInicial, mesFinal, anoFinal;
    if (isRange) {
        const parts = periodo.split('-');
        [mesInicial, anoInicial] = parts[0].split('/');
        [mesFinal, anoFinal]     = parts[1].split('/');
    } else {
        [mesInicial, anoInicial] = periodo.split('/');
        mesFinal = mesInicial; anoFinal = anoInicial;
    }
    const dtInicial = new Date(anoInicial, parseInt(mesInicial) - 1, 1);
    const dtFinal   = new Date(anoFinal,   parseInt(mesFinal),       0);
    const tituloPeriodo = isRange
        ? `${mesInicial}/${anoInicial} a ${mesFinal}/${anoFinal}`
        : periodo;

    /* ── Ocorrências ────────────────────────────────────────────── */
    const ocSnap = await db.collection('ocorrencias')
        .where('cliente_id', '==', cliente_id).get();

    const ocorrenciasList = ocSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(oc => {
            if (!oc.data) return false;
            const m = oc.data.match(/(\d{2})\/(\d{2})\/(\d{4})/);
            if (!m) return false;
            const d = new Date(m[3], parseInt(m[2]) - 1, parseInt(m[1]));
            return d >= dtInicial && d <= dtFinal;
        })
        .sort((a, b) => {
            const ma = a.data.match(/(\d{2})\/(\d{2})\/(\d{4})/);
            const mb = b.data.match(/(\d{2})\/(\d{2})\/(\d{4})/);
            if (!ma || !mb) return 0;
            return new Date(ma[3], parseInt(ma[2]) - 1, parseInt(ma[1]))
                 - new Date(mb[3], parseInt(mb[2]) - 1, parseInt(mb[1]));
        });

    /* ── Agrupar por mês ─────────────────────────────────────────── */
    const agrupado = {};
    ocorrenciasList.forEach(oc => {
        const m = oc.data ? oc.data.match(/(\d{1,2})[\/\-](\d{2})[\/\-](\d{4})/) : null;
        const chave = m ? m[2].padStart(2, '0') + '/' + m[3] : 'Desconhecido';
        if (!agrupado[chave]) agrupado[chave] = [];
        agrupado[chave].push(oc);
    });

    /* ── Calcular métricas por mês ───────────────────────────────── */
    let dLoop = new Date(dtInicial);
    const mesesResultados = [];
    let somaRotas = 0, somaOcorrencias = 0;

    while (dLoop <= dtFinal) {
        const ms = String(dLoop.getMonth() + 1).padStart(2, '0') + '/' + dLoop.getFullYear();
        const rotas = rotasMensais[ms] || 0;
        const ocsMes = agrupado[ms] ? agrupado[ms].length : 0;
        somaRotas += rotas; somaOcorrencias += ocsMes;

        let pct = 100;
        if (rotas > 0) pct = ((rotas - ocsMes) / rotas) * 100;

        let nivel = 'Limite Crítico', corNivel = '#dc2626';
        if (pct >= 99.0) { nivel = 'Excelência'; corNivel = '#16a34a'; }
        else if (pct >= 97.0) { nivel = 'Padrão de Mercado'; corNivel = '#d97706'; }

        // culpado por mês
        const culpados = { operacional: 0, motorista: 0, oficina: 0, cliente: 0, sem_info: 0 };
        (agrupado[ms] || []).forEach(oc => {
            const c = oc.culpado;
            if (c && culpados.hasOwnProperty(c)) culpados[c]++;
            else culpados.sem_info++;
        });
        const totalOp = culpados.operacional + culpados.motorista + culpados.oficina;
        const pctOp = ocsMes > 0 ? ((totalOp / ocsMes) * 100).toFixed(1) : '0.0';

        mesesResultados.push({ ms, rotas, ocorrencias: ocsMes, pct, nivel, corNivel, culpados, pctOp, lista: agrupado[ms] || [] });
        dLoop.setMonth(dLoop.getMonth() + 1);
    }

    const nMeses      = Math.max(1, mesesResultados.length);
    const mediaRotas  = Math.round(somaRotas / nMeses);
    let metaGeral = 100;
    if (somaRotas > 0) metaGeral = ((somaRotas - somaOcorrencias) / somaRotas) * 100;
    let nivelGeral = 'Limite Crítico', corNivelGeral = '#dc2626';
    if (metaGeral >= 99.0) { nivelGeral = 'Excelência'; corNivelGeral = '#16a34a'; }
    else if (metaGeral >= 97.0) { nivelGeral = 'Padrão de Mercado'; corNivelGeral = '#d97706'; }

    const mTolerancia = Math.round(mediaRotas * 0.03);
    const mMeta       = Math.round(mediaRotas * 0.01);
    const peso        = mediaRotas > 0 ? ((1 / mediaRotas) * 100).toFixed(3) : '0.000';

    // Culpados geral
    const cg = { operacional: 0, motorista: 0, oficina: 0, cliente: 0, sem_info: 0 };
    ocorrenciasList.forEach(oc => {
        const c = oc.culpado;
        if (c && cg.hasOwnProperty(c)) cg[c]++;
        else cg.sem_info++;
    });
    const totalOpGeral = cg.operacional + cg.motorista + cg.oficina;
    const pctOpGeral   = somaOcorrencias > 0 ? ((totalOpGeral / somaOcorrencias) * 100).toFixed(1) : '0.0';

    const dtEmissao = new Date().toLocaleDateString('pt-BR');

    /* ════════════════════════════════════════════════════════════════
       HTML  –  DOCUMENTO SLA
       ════════════════════════════════════════════════════════════════ */
    const mesesHtml = mesesResultados.map(mr => {
        const ocRows = mr.lista.length === 0
            ? `<tr><td colspan="4" style="text-align:center;color:#64748b;padding:12px;font-style:italic;">Nenhuma ocorrência registrada neste mês.</td></tr>`
            : mr.lista.map(oc => `
                <tr>
                    <td style="text-align:center;font-weight:600;color:#4f46e5">${oc.numero_original || '–'}</td>
                    <td style="text-align:center">${oc.data || '–'}</td>
                    <td>${oc.descricao || '–'}</td>
                    <td>${oc.status || '–'}</td>
                </tr>`).join('');

        return `
        <div class="mes-block">
            <div class="mes-header">
                <span class="mes-titulo">${mr.ms}</span>
                <span class="nivel-badge" style="background:${mr.corNivel}20;color:${mr.corNivel};border:1px solid ${mr.corNivel}40">${mr.nivel}</span>
            </div>
            <div class="mes-kpis">
                <div class="mes-kpi">
                    <div class="mes-kpi-label">OCORRÊNCIA GERAL</div>
                    <div class="mes-kpi-value" style="color:${mr.corNivel}">${mr.pct.toFixed(2).replace('.', ',')}%</div>
                </div>
                <div class="mes-kpi">
                    <div class="mes-kpi-label">QUANTIDADE</div>
                    <div class="mes-kpi-value">${mr.ocorrencias}</div>
                </div>
                <div class="mes-kpi">
                    <div class="mes-kpi-label">OCORRÊNCIA OPERADOR</div>
                    <div class="mes-kpi-value">${mr.pctOp.replace('.', ',')}%</div>
                </div>
                <div class="mes-kpi">
                    <div class="mes-kpi-label">ROTAS NO MÊS</div>
                    <div class="mes-kpi-value">${mr.rotas.toLocaleString('pt-BR')}</div>
                </div>
            </div>
            ${mr.lista.length > 0 ? `
            <table class="oc-table">
                <thead>
                    <tr>
                        <th style="width:60px;text-align:center">Nº</th>
                        <th style="width:100px;text-align:center">Data</th>
                        <th>Descrição</th>
                        <th style="width:180px">Resolução</th>
                    </tr>
                </thead>
                <tbody>${ocRows}</tbody>
            </table>` : `<p class="sem-oc">Nenhuma ocorrência registrada neste mês.</p>`}
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SLA – ${nome_cliente} – ${tituloPeriodo}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
    /* ── Reset ─────────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
        --indigo: #4f46e5;
        --indigo-light: #e0e7ff;
        --text: #0f172a;
        --muted: #64748b;
        --border: #e2e8f0;
        --surface: #f8fafc;
        --radius: 10px;
    }
    body {
        font-family: 'Inter', sans-serif;
        background: #f1f5f9;
        color: var(--text);
        font-size: 13px;
        line-height: 1.6;
    }

    /* ── Barra de impressão (só na tela) ────────────────── */
    .print-bar {
        background: var(--indigo);
        color: #fff;
        padding: .75rem 2rem;
        display: flex; align-items: center; justify-content: space-between;
        gap: 1rem;
        position: sticky; top: 0; z-index: 100;
    }
    .print-bar span { font-size: .85rem; font-weight: 500; }
    .btn-print {
        background: #fff; color: var(--indigo);
        font-weight: 700; font-size: .82rem;
        padding: .5rem 1.4rem; border-radius: 8px;
        border: none; cursor: pointer;
        display: flex; align-items: center; gap: .5rem;
        transition: opacity .2s;
    }
    .btn-print:hover { opacity: .88; }

    /* ── Documento ──────────────────────────────────────── */
    .doc {
        max-width: 900px;
        margin: 2rem auto;
        background: #fff;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 8px 40px rgba(0,0,0,.12);
    }

    /* ── Capa ───────────────────────────────────────────── */
    .capa {
        background: linear-gradient(135deg, #1e1b4b 0%, var(--indigo) 100%);
        color: #fff;
        padding: 3rem 3rem 2.5rem;
        position: relative;
        overflow: hidden;
    }
    .capa::after {
        content: '';
        position: absolute; top: -60px; right: -60px;
        width: 280px; height: 280px;
        border-radius: 50%;
        background: rgba(255,255,255,.05);
    }
    .capa-badge {
        display: inline-block;
        background: rgba(255,255,255,.15);
        border: 1px solid rgba(255,255,255,.25);
        border-radius: 99px;
        padding: .3rem .9rem;
        font-size: .72rem; font-weight: 600; letter-spacing: .06em;
        text-transform: uppercase; margin-bottom: 1.2rem;
    }
    .capa-title {
        font-size: 2rem; font-weight: 800; letter-spacing: -.03em;
        margin-bottom: .3rem;
    }
    .capa-sub {
        font-size: 1.05rem; font-weight: 400; opacity: .75;
        margin-bottom: 2rem;
    }
    .capa-meta {
        display: flex; gap: 2rem; flex-wrap: wrap;
        font-size: .8rem; opacity: .8;
    }
    .capa-meta span { display: flex; flex-direction: column; gap: .1rem; }
    .capa-meta strong { font-size: 1rem; font-weight: 700; opacity: 1; color: #fff; }

    /* ── Conteúdo interno ───────────────────────────────── */
    .doc-body { padding: 2.5rem 3rem; }

    /* ── Seção ──────────────────────────────────────────── */
    .secao { margin-bottom: 2.5rem; }
    .secao-titulo {
        font-size: .72rem; font-weight: 700;
        text-transform: uppercase; letter-spacing: .1em;
        color: var(--indigo);
        padding-bottom: .5rem;
        border-bottom: 2px solid var(--indigo-light);
        margin-bottom: 1.2rem;
    }
    .secao-num { opacity: .4; margin-right: .4rem; }

    /* ── Parágrafo ──────────────────────────────────────── */
    .p { color: var(--text); line-height: 1.8; margin-bottom: .75rem; text-align: justify; }
    .p-indent { text-indent: 1.5rem; }
    .p-bold { font-weight: 600; }

    /* ── Tabela de KPIs ─────────────────────────────────── */
    .kpi-table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    .kpi-table th {
        background: var(--indigo); color: #fff;
        font-size: .72rem; font-weight: 600; letter-spacing: .05em;
        padding: .65rem 1rem; text-align: left;
    }
    .kpi-table th:not(:first-child) { text-align: center; }
    .kpi-table td {
        padding: .65rem 1rem; font-size: .82rem;
        border-bottom: 1px solid var(--border);
    }
    .kpi-table td:not(:first-child) { text-align: center; font-weight: 600; }
    .kpi-table tr:last-child td { border-bottom: none; }
    .kpi-table tr:nth-child(even) td { background: var(--surface); }

    /* ── KPI cards do resultado ─────────────────────────── */
    .resultado-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1rem; margin-bottom: 1.5rem;
    }
    .res-card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 1.1rem 1.2rem;
    }
    .res-label { font-size: .68rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: .3rem; }
    .res-value { font-size: 1.6rem; font-weight: 800; line-height: 1; }
    .res-sub   { font-size: .72rem; color: var(--muted); margin-top: .2rem; }

    /* ── Bloco de mês ───────────────────────────────────── */
    .mes-block {
        border: 1px solid var(--border);
        border-radius: var(--radius);
        margin-bottom: 1.5rem;
        overflow: hidden;
        break-inside: avoid;
        page-break-inside: avoid;
    }
    .mes-header {
        background: var(--surface);
        border-bottom: 1px solid var(--border);
        padding: .75rem 1.2rem;
        display: flex; align-items: center; justify-content: space-between;
    }
    .mes-titulo { font-size: 1rem; font-weight: 700; color: var(--text); }
    .nivel-badge {
        font-size: .7rem; font-weight: 700;
        padding: .2rem .75rem; border-radius: 99px;
        letter-spacing: .03em;
    }
    .mes-kpis {
        display: grid; grid-template-columns: repeat(4, 1fr);
        gap: 0; border-bottom: 1px solid var(--border);
    }
    .mes-kpi {
        padding: .8rem 1.2rem;
        border-right: 1px solid var(--border);
    }
    .mes-kpi:last-child { border-right: none; }
    .mes-kpi-label { font-size: .63rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; margin-bottom: .2rem; }
    .mes-kpi-value { font-size: 1.1rem; font-weight: 800; color: var(--text); }

    /* ── Tabela de ocorrências ──────────────────────────── */
    .oc-table { width: 100%; border-collapse: collapse; font-size: .78rem; }
    .oc-table th {
        background: #f1f5f9; color: var(--muted);
        font-size: .67rem; font-weight: 600; letter-spacing: .05em;
        text-transform: uppercase;
        padding: .5rem .75rem; text-align: left;
        border-bottom: 1px solid var(--border);
    }
    .oc-table td {
        padding: .55rem .75rem;
        border-bottom: 1px solid var(--border);
        vertical-align: top;
    }
    .oc-table tr:last-child td { border-bottom: none; }
    .oc-table tr:nth-child(even) td { background: #fafafa; }

    .sem-oc { padding: 1rem 1.2rem; color: var(--muted); font-style: italic; font-size: .82rem; }

    /* ── Rodapé ─────────────────────────────────────────── */
    .rodape {
        background: var(--surface);
        border-top: 1px solid var(--border);
        padding: 1.2rem 3rem;
        font-size: .72rem; color: var(--muted);
        display: flex; justify-content: space-between; align-items: center;
    }

    /* ══════════════════════════════════════════════════════
       PRINT
       ══════════════════════════════════════════════════════ */
    @media print {
        @page { size: A4 portrait; margin: 12mm 14mm; }

        body { background: #fff !important; }
        .print-bar { display: none !important; }
        .doc {
            max-width: 100% !important;
            margin: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
        }
        .doc-body { padding: 1.5rem 2rem !important; }
        .capa { padding: 2rem 2rem 1.5rem !important; }

        .mes-block { break-inside: avoid; page-break-inside: avoid; margin-bottom: 1rem !important; }
        .resultado-grid { grid-template-columns: repeat(3,1fr) !important; }
        .mes-kpis { grid-template-columns: repeat(4,1fr) !important; }

        .capa { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .nivel-badge { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .kpi-table th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

        .secao { margin-bottom: 1.5rem !important; }
    }
</style>
</head>
<body>

<!-- ── Barra de ações (só na tela) ───────────────────────────────── -->
<div class="print-bar no-print">
    <span>📄 SLA – ${nome_cliente} – ${tituloPeriodo}</span>
    <button class="btn-print" onclick="window.print()">
        🖨️ Imprimir / Salvar PDF
    </button>
</div>

<!-- ── Documento ─────────────────────────────────────────────────── -->
<div class="doc">

    <!-- CAPA -->
    <div class="capa">
        <div class="capa-badge">Acordo de Nível de Serviço</div>
        <div class="capa-title">SLA Operacional</div>
        <div class="capa-sub">${nome_cliente}</div>
        <div class="capa-meta">
            <span><small>Período</small><strong>${tituloPeriodo}</strong></span>
            <span><small>Emissão</small><strong>${dtEmissao}</strong></span>
            <span><small>Total de Rotas</small><strong>${somaRotas.toLocaleString('pt-BR')}</strong></span>
            <span><small>Total de Ocorrências</small><strong>${somaOcorrencias}</strong></span>
            <span><small>SLA Geral</small><strong style="color:${corNivelGeral}">${metaGeral.toFixed(2).replace('.', ',')}%</strong></span>
        </div>
    </div>

    <div class="doc-body">

        <!-- 1. OBJETIVO -->
        <div class="secao">
            <div class="secao-titulo"><span class="secao-num">1.</span> Objetivo</div>
            <p class="p p-indent">
                Este documento estabelece os parâmetros de performance e confiabilidade esperados
                para a operação de transporte fretado da empresa <strong>${nome_cliente}</strong>,
                fundamentado em índices de mercado e normas técnicas do setor logístico e de transportes.
            </p>
        </div>

        <!-- 2. ESCOPO -->
        <div class="secao">
            <div class="secao-titulo"><span class="secao-num">2.</span> Escopo da Operação</div>
            <table class="kpi-table">
                <thead>
                    <tr>
                        <th>Mês de Referência</th>
                        <th>Rotas Realizadas</th>
                        <th>Ocorrências</th>
                        <th>SLA do Mês</th>
                        <th>Classificação</th>
                    </tr>
                </thead>
                <tbody>
                    ${mesesResultados.map(mr => `
                    <tr>
                        <td style="font-weight:600">${mr.ms}</td>
                        <td>${mr.rotas.toLocaleString('pt-BR')}</td>
                        <td>${mr.ocorrencias}</td>
                        <td style="color:${mr.corNivel};font-weight:700">${mr.pct.toFixed(2).replace('.', ',')}%</td>
                        <td><span style="background:${mr.corNivel}15;color:${mr.corNivel};padding:.2rem .6rem;border-radius:99px;font-size:.7rem;font-weight:700">${mr.nivel}</span></td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>

        <!-- 3. METAS DE PERFORMANCE -->
        <div class="secao">
            <div class="secao-titulo"><span class="secao-num">3.</span> Metas de Performance (KPIs)</div>
            <p class="p p-indent">
                Para uma operação média de <strong>${mediaRotas.toLocaleString('pt-BR')} rotas/mês</strong>,
                a eficiência é medida pela continuidade do serviço e disponibilidade da frota.
                O índice de ocorrências deve ser monitorado conforme a tabela abaixo:
            </p>
            <table class="kpi-table" style="margin-top:1rem">
                <thead>
                    <tr>
                        <th>Indicador</th>
                        <th>Percentual</th>
                        <th>Limite (${mediaRotas.toLocaleString('pt-BR')} rotas)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>Tolerância Máxima (SLA)</strong></td>
                        <td>3,0%</td>
                        <td>Até ${mTolerancia} ocorrências</td>
                    </tr>
                    <tr>
                        <td><strong>Meta de Excelência Operacional</strong></td>
                        <td>1,0%</td>
                        <td>Até ${mMeta} ocorrências</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- 4. FUNDAMENTAÇÃO -->
        <div class="secao">
            <div class="secao-titulo"><span class="secao-num">4.</span> Fundamentação e Fontes Técnicas</div>
            <p class="p p-indent">Os indicadores apresentados baseiam-se nos seguintes pilares de governança:</p>
            <p class="p p-indent"><strong>ANTP (Associação Nacional de Transportes Públicos):</strong>
            Segundo os manuais de boas práticas de gestão de frotas, operações de fretamento que seguem
            planos de manutenção preventiva rigorosos apresentam índices de interrupção inferiores a 1%.</p>
            <p class="p p-indent"><strong>Conformidade de Engenharia (Padrão Mercedes-Benz):</strong>
            A Mercedes-Benz estabelece que uma gestão de frota eficiente deve garantir disponibilidade técnica
            superior a 90%, com taxa de falhas mecânicas entre 2,2 e 2,8 eventos mensais por chassi em regimes severos.</p>
            <p class="p p-indent"><strong>Padrões de Procurement Corporativo:</strong>
            O mercado de compras de serviços logísticos utiliza o teto de 3% de variabilidade para considerar
            um contrato em conformidade. Acima deste índice, há impacto direto na produtividade da empresa contratante.</p>
            <p class="p p-indent"><strong>Matriz de Variabilidade Urbana:</strong>
            O percentual aceitável de 2% a 3% é a margem estatística padrão para absorver eventos externos
            (trânsito, acidentes de terceiros, condições climáticas) sem comprometer a pontualidade mensal.</p>
        </div>

        <!-- 5. CONCLUSÃO -->
        <div class="secao">
            <div class="secao-titulo"><span class="secao-num">5.</span> Conclusão Operacional</div>
            <p class="p p-indent">
                Em uma escala média de <strong>${mediaRotas.toLocaleString('pt-BR')} rotas mensais</strong>,
                cada incidente isolado possui um peso estatístico de aproximadamente
                <strong>${peso.replace('.', ',')}%</strong>.
                A estabilidade da operação está diretamente ligada à prontidão na substituição de veículos
                e à manutenção rigorosa da frota.
            </p>

            <!-- Resultado geral -->
            <div class="resultado-grid" style="margin-top:1.2rem">
                <div class="res-card">
                    <div class="res-label">SLA Geral do Período</div>
                    <div class="res-value" style="color:${corNivelGeral}">${metaGeral.toFixed(2).replace('.', ',')}%</div>
                    <div class="res-sub">${nivelGeral}</div>
                </div>
                <div class="res-card">
                    <div class="res-label">Total de Ocorrências</div>
                    <div class="res-value">${somaOcorrencias}</div>
                    <div class="res-sub">em ${somaRotas.toLocaleString('pt-BR')} rotas</div>
                </div>
                <div class="res-card">
                    <div class="res-label">Ocorrência Operador</div>
                    <div class="res-value">${pctOpGeral.replace('.', ',')}%</div>
                    <div class="res-sub">responsabilidade interna</div>
                </div>
            </div>
        </div>

        <!-- 6. RELATÓRIO DE OCORRÊNCIAS -->
        <div class="secao">
            <div class="secao-titulo"><span class="secao-num">6.</span> Relatório de Ocorrências por Período</div>
            ${mesesHtml}
        </div>

    </div><!-- /doc-body -->

    <!-- RODAPÉ -->
    <div class="rodape">
        <span>Auto SLA – Documento gerado automaticamente em ${dtEmissao}</span>
        <span>${nome_cliente} &nbsp;|&nbsp; ${tituloPeriodo}</span>
    </div>

</div><!-- /doc -->
</body>
</html>`;

    return html;
}

module.exports = { gerarSLAHtml };
