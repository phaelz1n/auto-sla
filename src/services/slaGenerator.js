'use strict';

const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, HeadingLevel,
    ShadingType, VerticalAlign, PageBreak
} = require('docx');

const PizZip    = require('pizzip');
const Docxtemplater = require('docxtemplater');
const path      = require('path');
const fs        = require('fs');
const db        = require('../config/firebase');

/* ─── Helpers de estilo ─────────────────────────────────────────── */
const FONT = 'Arial';

function bold(text, size) {
    return new TextRun({ text, bold: true, font: FONT, size: size || 22 });
}
function normal(text, size) {
    return new TextRun({ text, font: FONT, size: size || 22 });
}
function italic(text, size) {
    return new TextRun({ text, italics: true, font: FONT, size: size || 22 });
}

function h1(text) {
    return new Paragraph({
        children: [bold(text, 24)],
        alignment: AlignmentType.CENTER,
        spacing: { before: 240, after: 120 }
    });
}

function h2(text) {
    return new Paragraph({
        children: [bold(text, 22)],
        spacing: { before: 280, after: 160 }
    });
}

function h3(text) {
    return new Paragraph({
        children: [bold(text, 22)],
        spacing: { before: 240, after: 80 },
        style: 'Heading3'
    });
}

function bodyPara(children, opts) {
    return new Paragraph({
        children,
        spacing: { line: 276, after: 240 },
        indent: opts && opts.indent ? { firstLine: 720 } : undefined,
        alignment: opts && opts.justify ? AlignmentType.BOTH : undefined
    });
}

function emptyLine() {
    return new Paragraph({ children: [new TextRun('')], spacing: { before: 120, after: 120 } });
}

/* ─── Borda de célula ───────────────────────────────────────────── */
const THIN_BORDER = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
const CELL_BORDERS = {
    top: THIN_BORDER, bottom: THIN_BORDER,
    left: THIN_BORDER, right: THIN_BORDER
};

function tableCell(children, opts) {
    return new TableCell({
        children: Array.isArray(children) ? children : [children],
        borders: CELL_BORDERS,
        margins: { top: 100, bottom: 100, left: 100, right: 100 },
        shading: opts && opts.header
            ? { type: ShadingType.CLEAR, fill: 'D9D9D9' }
            : undefined,
        verticalAlign: VerticalAlign.CENTER
    });
}

/* ─── Label de culpado ──────────────────────────────────────────── */
const CULPA_LABELS = {
    operacional: 'Setor Operacional',
    motorista:   'Motorista',
    oficina:     'Oficina',
    cliente:     'Erro do Cliente',
    fator_externo: 'Fator Externo',
    chapeacao:   'Chapeação',
    '':          'Nao informado'
};
function culpaLabel(c) {
    return CULPA_LABELS[c] || 'Nao informado';
}

/* ══════════════════════════════════════════════════════════════════
   Funcao principal – gera o DOCX automatizado a partir dos dados
   ══════════════════════════════════════════════════════════════════ */
async function gerarSLAAutomatizado(periodo, clientesList, rotasMap) {
    if (!db) throw new Error('Firebase nao configurado.');

    const exportZip = new PizZip();
    let generatedFilesCount = 0;
    let lastBuf = null;

    for (const cliente_id of clientesList) {
        /* ── Buscar dados do cliente ────────────────────────────── */
        const clienteDoc = await db.collection('clientes').doc(String(cliente_id)).get();
        const nome_cliente = clienteDoc.exists ? clienteDoc.data().nome : 'Cliente Desconhecido';

        /* ── Parsear periodo ────────────────────────────────────── */
        const isRange = periodo.includes('-');
        let mesInicial, anoInicial, mesFinal, anoFinal;

        if (isRange) {
            const parts = periodo.split('-');
            [mesInicial, anoInicial] = parts[0].split('/');
            [mesFinal, anoFinal]     = parts[1].split('/');
        } else {
            [mesInicial, anoInicial] = periodo.split('/');
            mesFinal = mesInicial;
            anoFinal = anoInicial;
        }

        const dtInicial = new Date(anoInicial, parseInt(mesInicial) - 1, 1);
        const dtFinal   = new Date(anoFinal,   parseInt(mesFinal),       0);

        /* ── Buscar ocorrencias ─────────────────────────────────── */
        const ocSnap = await db.collection('ocorrencias')
            .where('cliente_id', '==', cliente_id)
            .get();
        const todasOcorrencias = ocSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const ocorrenciasList = todasOcorrencias
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

        /* ── Agrupar por mes ─────────────────────────────────────── */
        const agrupado = {};
        ocorrenciasList.forEach(oc => {
            const m = oc.data ? oc.data.match(/(\d{1,2})[\/\-](\d{2})[\/\-](\d{4})/) : null;
            const chave = m ? m[2].padStart(2, '0') + '/' + m[3] : 'Desconhecido';
            if (!agrupado[chave]) agrupado[chave] = [];
            agrupado[chave].push(oc);
        });

        /* ── Calculos por mes ───────────────────────────────────── */
        const metasMensais = rotasMap[cliente_id] || {};
        let dLoop = new Date(dtInicial);
        const mesesResultados = [];
        let somaRotas = 0;
        let somaOcorrencias = 0;

        while (dLoop <= dtFinal) {
            const monthStr = String(dLoop.getMonth() + 1).padStart(2, '0') + '/' + dLoop.getFullYear();
            const rotas = metasMensais[monthStr] || 0;
            const ocsMes = agrupado[monthStr] ? agrupado[monthStr].length : 0;

            somaRotas       += rotas;
            somaOcorrencias += ocsMes;

            let metaPct = 100;
            if (rotas > 0) metaPct = ((rotas - ocsMes) / rotas) * 100;

            let nivel = 'Limite Critico (Plano de Acao)';
            if (metaPct >= 99.0) nivel = 'Excelencia (Alta Performance)';
            else if (metaPct >= 97.0) nivel = 'Padrao de Mercado (Saudavel)';

            // Contagem de culpados no mes
            const culpadosMes = { operacional: 0, motorista: 0, oficina: 0, cliente: 0, fator_externo: 0, chapeacao: 0, sem_info: 0 };
            (agrupado[monthStr] || []).forEach(oc => {
                const c = oc.culpado;
                if (c && culpadosMes.hasOwnProperty(c)) culpadosMes[c]++;
                else culpadosMes.sem_info++;
            });

            mesesResultados.push({
                mes: monthStr,
                rotas,
                ocorrencias: ocsMes,
                metaPct,
                meta: metaPct.toFixed(2).replace('.', ',') + '%',
                nivel,
                lista: agrupado[monthStr] || [],
                culpados: culpadosMes
            });

            dLoop.setMonth(dLoop.getMonth() + 1);
        }

        const nMeses = Math.max(1, mesesResultados.length);
        const mediaRotas = Math.round(somaRotas / nMeses);

        let metaGeral = 100;
        if (somaRotas > 0) metaGeral = ((somaRotas - somaOcorrencias) / somaRotas) * 100;
        let nivelGeral = 'Limite Critico (Plano de Acao)';
        if (metaGeral >= 99.0) nivelGeral = 'Excelencia (Alta Performance)';
        else if (metaGeral >= 97.0) nivelGeral = 'Padrao de Mercado (Saudavel)';

        const mTolerancia = Math.round(mediaRotas * 0.03);
        const mMeta       = Math.round(mediaRotas * 0.01);
        const peso        = mediaRotas > 0 ? ((1 / mediaRotas) * 100).toFixed(3).replace('.', ',') : '0,000';

        const tituloPeriodo = isRange
            ? mesInicial + '/' + anoInicial + ' a ' + mesFinal + '/' + anoFinal
            : periodo;

        /* ── Contagem global de culpados ────────────────────────── */
        const culpadosGeral = { operacional: 0, motorista: 0, oficina: 0, cliente: 0, fator_externo: 0, chapeacao: 0, sem_info: 0 };
        ocorrenciasList.forEach(oc => {
            const c = oc.culpado;
            if (c && culpadosGeral.hasOwnProperty(c)) culpadosGeral[c]++;
            else culpadosGeral.sem_info++;
        });

        /* ══════════════════════════════════════════════════════════
           Montar o documento DOCX
           ══════════════════════════════════════════════════════════ */
        const sections = [];

        /* ── CABEÇALHO ─────────────────────────────────────────── */
        sections.push(
            emptyLine(),
            h1('SLA OPERACIONAL ' + nome_cliente.toUpperCase()),
            new Paragraph({
                children: [italic('(Acordo de Nivel de Servico)', 22)],
                alignment: AlignmentType.CENTER,
                spacing: { after: 80 }
            }),
            emptyLine(),
            bodyPara([bold('Assunto: ', 22), normal('Definicao de Niveis de Servico (SLA) para Transporte Fretado', 22)])
        );

        // Escopo por mes
        mesesResultados.forEach(mr => {
            sections.push(
                bodyPara([bold('Escopo: ', 22), normal('Operacao de ' + mr.rotas + ' rotas mensais ' + mr.mes, 22)])
            );
        });

        sections.push(emptyLine());

        /* ── SEÇÃO 1: OBJETIVO ─────────────────────────────────── */
        sections.push(
            h2('1. OBJETIVO'),
            bodyPara([
                normal(
                    'Este documento estabelece os parametros de performance e confiabilidade esperados para uma operacao de transporte fretado de medio porte, fundamentado em indices de mercado e normas tecnicas do setor logistico e de transportes.',
                    22
                )
            ])
        );

        /* ── SEÇÃO 2: METAS DE PERFORMANCE ────────────────────── */
        sections.push(
            h2('2. METAS DE PERFORMANCE (KPIs)'),
            bodyPara([
                normal('Para uma operacao media de ', 22),
                bold(String(mediaRotas), 22),
                normal(' rotas/mes, a eficiencia e medida pela continuidade do servico e disponibilidade da frota. O indice de ocorrencias deve ser monitorado conforme a tabela de conformidade abaixo:', 22)
            ])
        );

        // Tabela de KPIs
        const tblKPI = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({
                    children: [
                        tableCell(
                            new Paragraph({ children: [bold('Indicador', 20)], spacing: { after: 120 } }),
                            { header: true }
                        ),
                        tableCell(
                            new Paragraph({ children: [bold('Percentual de Referencia', 20)], spacing: { after: 120 } }),
                            { header: true }
                        ),
                        tableCell(
                            new Paragraph({ children: [bold('Limite de Ocorrencias (' + mediaRotas + ' rotas)', 20)], spacing: { after: 120 } }),
                            { header: true }
                        )
                    ]
                }),
                new TableRow({
                    children: [
                        tableCell(new Paragraph({ children: [bold('Tolerancia Maxima (SLA)', 20)], spacing: { after: 80 } })),
                        tableCell(new Paragraph({ children: [bold('3,0%', 20)], spacing: { after: 80 } })),
                        tableCell(new Paragraph({ children: [bold('Ate ' + mTolerancia + ' ocorrencias', 20)], spacing: { after: 80 } }))
                    ]
                }),
                new TableRow({
                    children: [
                        tableCell(new Paragraph({ children: [bold('Meta de Excelencia Operacional', 20)], spacing: { after: 80 } })),
                        tableCell(new Paragraph({ children: [bold('1,0%', 20)], spacing: { after: 80 } })),
                        tableCell(new Paragraph({ children: [bold('Ate ' + mMeta + ' ocorrencias', 20)], spacing: { after: 80 } }))
                    ]
                })
            ]
        });
        sections.push(new Paragraph({ children: [] }));
        sections.push(tblKPI);
        sections.push(emptyLine());

        /* ── SEÇÃO 3: FUNDAMENTAÇÃO ────────────────────────────── */
        sections.push(
            h2('3. FUNDAMENTACAO E FONTES TECNICAS'),
            bodyPara([normal('Os indicadores apresentados baseiam-se nos seguintes pilares de governanca:', 22)], { indent: true, justify: true }),
            bodyPara([
                bold('ANTP (Associacao Nacional de Transportes Publicos)', 22),
                normal(': Segundo os manuais de boas praticas de gestao de frotas, operacoes de fretamento que seguem planos de manutencao preventiva rigorosos apresentam indices de interrupcao de viagem por falha tecnica inferiores a 1%.', 22)
            ], { indent: true, justify: true }),
            bodyPara([
                bold('Conformidade de Engenharia (Padrao Mercedes-Benz):', 22),
                normal(' Os indices de disponibilidade reportados pressupõem que a manutencao segue rigorosamente os Manuais do Fabricante. A Mercedes-Benz estabelece que uma gestao de frota eficiente deve garantir uma disponibilidade tecnica superior a 90%, com uma taxa de falhas mecanicas prevista entre 2,2 e 2,8 eventos mensais por chassi em regimes severos.', 22)
            ], { indent: true, justify: true }),
            bodyPara([
                bold('Padroes de Procurement Corporativo (SLA):', 22),
                normal(' O mercado de compras de servicos logisticos utiliza o teto de 3% de variabilidade para considerar um contrato em conformidade. Acima deste indice, entende-se que ha um impacto direto na produtividade e no fluxo de turnos da empresa contratante.', 22)
            ], { indent: true, justify: true }),
            bodyPara([
                bold('Matriz de Variabilidade Urbana:', 22),
                normal(' O percentual aceitavel de 2% a 3% e a margem estatistica padrao utilizada para absorver eventos externos (transito, acidentes de terceiros e condicoes climaticas) sem comprometer a media mensal de pontualidade.', 22)
            ], { indent: true, justify: true })
        );

        /* ── SEÇÃO 4: CONCLUSÃO OPERACIONAL ───────────────────── */
        sections.push(
            h2('4. CONCLUSAO OPERACIONAL'),
            bodyPara([
                normal('Em uma media de escala de ', 22),
                bold(String(mediaRotas), 22),
                normal(' rotas mensais, cada incidente isolado possui um peso estatistico de aproximadamente ', 22),
                bold('0,' + peso.replace('0,', ''), 22),
                normal('%. A estabilidade da operacao esta diretamente ligada a prontidao na substituicao de veiculos e a manutencao rigorosa da frota.', 22)
            ], { indent: true, justify: true })
        );

        /* ── RESULTADO GERAL DO PERÍODO ───────────────────────── */
        sections.push(
            emptyLine(),
            new Paragraph({
                children: [
                    bold('RESULTADO GERAL DO PERIODO: ', 22),
                    bold(metaGeral.toFixed(2).replace('.', ',') + '%', 22),
                    new TextRun({ text: '    ', font: FONT, size: 22 }),
                    bold('Classificacao: ', 22),
                    bold(nivelGeral, 22)
                ],
                spacing: { after: 80 }
            }),
            new Paragraph({
                children: [
                    bold('Total de Rotas: ', 22), normal(String(somaRotas), 22),
                    normal('    |    ', 22),
                    bold('Total de Ocorrencias: ', 22), normal(String(somaOcorrencias), 22)
                ],
                spacing: { after: 80 }
            }),
            emptyLine()
        );

        /* ── RESPONSABILIDADE DO OPERADOR – PERIODO COMPLETO ────── */
        if (somaOcorrencias > 0) {
            const totalOperador = culpadosGeral.operacional + culpadosGeral.motorista + culpadosGeral.oficina + culpadosGeral.chapeacao + culpadosGeral.sem_info;
            const pctOperador = ((totalOperador / somaOcorrencias) * 100).toFixed(1).replace('.', ',') + '%';
            sections.push(
                new Paragraph({
                    children: [
                        bold('Operador: ', 22),
                        normal(pctOperador + ' das ocorrencias sao de responsabilidade do operador.', 22)
                    ],
                    spacing: { after: 240 }
                }),
                emptyLine()
            );
        }

        /* ── SEÇÃO 5: RELATÓRIO DE OCORRÊNCIAS POR MÊS ────────── */
        sections.push(h2('5. RELATORIO DE OCORRENCIAS'));

        for (const mr of mesesResultados) {
            // Titulo do mes
            sections.push(
                new Paragraph({
                    children: [bold(mr.mes, 24)],
                    spacing: { before: 320, after: 80 },
                    heading: HeadingLevel.HEADING_3
                }),
                new Paragraph({
                    children: [
                        bold('OCORRENCIA GERAL: ' + mr.meta, 22),
                        new TextRun({ text: '        ', font: FONT, size: 22 }),
                        bold('Classificacao: ' + mr.nivel, 22)
                    ],
                    spacing: { after: 80 }
                }),
                new Paragraph({
                    children: [bold('QUANTIDADE DE OCORRENCIA: ' + mr.ocorrencias, 22)],
                    spacing: { after: 80 }
                }),
                new Paragraph({
                    children: (() => {
                        const totalOp = mr.culpados.operacional + mr.culpados.motorista + mr.culpados.oficina + mr.culpados.chapeacao + mr.culpados.sem_info;
                        const pctOp = mr.ocorrencias > 0
                            ? ((totalOp / mr.ocorrencias) * 100).toFixed(1).replace('.', ',') + '%'
                            : '0,0%';
                        return [bold('OCORRENCIA OPERADOR: ' + pctOp, 22)];
                    })(),
                    spacing: { after: 80 }
                })
            );

            sections.push(emptyLine());

            // Tabela de ocorrencias do mes (sem coluna de responsavel)
            if (mr.lista.length > 0) {
                const headerRow = new TableRow({
                    children: [
                        tableCell(new Paragraph({ children: [bold('No', 18)] }), { header: true }),
                        tableCell(new Paragraph({ children: [bold('Data', 18)] }), { header: true }),
                        tableCell(new Paragraph({ children: [bold('Descricao', 18)] }), { header: true }),
                        tableCell(new Paragraph({ children: [bold('Resolucao', 18)] }), { header: true })
                    ]
                });

                const dataRows = mr.lista.map(oc => new TableRow({
                    children: [
                        tableCell(new Paragraph({ children: [normal(oc.numero_original || '-', 18)] })),
                        tableCell(new Paragraph({ children: [normal(oc.data || '-', 18)] })),
                        tableCell(new Paragraph({ children: [normal(oc.descricao || '-', 18)], spacing: { after: 60 } })),
                        tableCell(new Paragraph({ children: [normal(oc.status || '-', 18)], spacing: { after: 60 } }))
                    ]
                }));

                const tbl = new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: [headerRow, ...dataRows]
                });

                sections.push(tbl);
                sections.push(emptyLine());
            } else {
                sections.push(
                    new Paragraph({
                        children: [italic('Nenhuma ocorrencia registrada neste mes.', 20)],
                        spacing: { after: 240 }
                    })
                );
            }
        }

        /* ── Montar e empacotar o documento ─────────────────────── */
        const doc = new Document({
            sections: [{
                properties: {
                    page: {
                        margin: { top: 1417, right: 1701, bottom: 1417, left: 1701 }
                    }
                },
                children: sections
            }]
        });

        const buf = await Packer.toBuffer(doc);
        lastBuf = buf;
        generatedFilesCount++;

        const safeCliente = nome_cliente.replace(/[^a-zA-Z0-9]/g, '_');
        const safePeriodo = periodo.replace(/\//g, '-');
        exportZip.file('SLA_' + safeCliente + '_' + safePeriodo + '.docx', buf);
    }

    if (generatedFilesCount === 1) {
        return { isZip: false, buf: lastBuf };
    } else {
        const finalZip = exportZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
        return { isZip: true, buf: finalZip };
    }
}

/* ══════════════════════════════════════════════════════════════════
   Gerador legado (usa template .docx via docxtemplater)
   Mantido para compatibilidade
   ══════════════════════════════════════════════════════════════════ */
async function gerarSLA(periodo, clientes, rotasMap, tipoExportacao) {
    if (!db) throw new Error('Firebase nao configurado. Adicione firebase-service-account.json');

    const clientesList = JSON.parse(clientes);
    const isMensal = tipoExportacao === 'mensal';
    const basePath = path.resolve(__dirname, '../../');
    const templateFile = isMensal ? 'template_mensal.docx' : 'template_geral.docx';
    const templatePath = path.join(basePath, templateFile);

    if (!fs.existsSync(templatePath)) {
        throw new Error('O arquivo ' + templateFile + ' nao foi encontrado na pasta raiz.');
    }

    const exportZip = new PizZip();
    let generatedFilesCount = 0;
    let lastBuf = null;

    for (const cliente_id of clientesList) {
        const clienteDoc = await db.collection('clientes').doc(String(cliente_id)).get();
        const nome_cliente = clienteDoc.exists ? clienteDoc.data().nome : 'Cliente Desconhecido';

        const isRange = periodo.includes('-');
        let mesInicial, anoInicial, mesFinal, anoFinal, parts;

        if (isRange) {
            parts = periodo.split('-');
            [mesInicial, anoInicial] = parts[0].split('/');
            [mesFinal, anoFinal]     = parts[1].split('/');
        } else {
            [mesInicial, anoInicial] = periodo.split('/');
            mesFinal = mesInicial;
            anoFinal = anoInicial;
        }

        const dtInicial = new Date(anoInicial, parseInt(mesInicial) - 1, 1);
        const dtFinal   = new Date(anoFinal,   parseInt(mesFinal),       0);

        const ocSnap = await db.collection('ocorrencias')
            .where('cliente_id', '==', cliente_id)
            .get();
        const ocorrenciasData = ocSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        let ocorrenciasList = ocorrenciasData.filter(oc => {
            if (!oc.data) return false;
            const match = oc.data.match(/(\d{2})\/(\d{2})\/(\d{4})/);
            if (!match) return false;
            const ocDate = new Date(match[3], parseInt(match[2]) - 1, parseInt(match[1]));
            return ocDate >= dtInicial && ocDate <= dtFinal;
        }).map(oc => ({ ...oc, numero: oc.numero_original || '-' }))
        .sort((a, b) => {
            const mA = a.data.match(/(\d{2})\/(\d{2})\/(\d{4})/);
            const mB = b.data.match(/(\d{2})\/(\d{2})\/(\d{4})/);
            if (!mA || !mB) return 0;
            return new Date(mA[3], parseInt(mA[2]) - 1, parseInt(mA[1]))
                 - new Date(mB[3], parseInt(mB[2]) - 1, parseInt(mB[1]));
        });

        const agrupado = {};
        ocorrenciasList.forEach(oc => {
            let m = 'Desconhecido';
            if (oc.data) {
                const match = oc.data.match(/(\d{1,2})[\/\-](\d{2})[\/\-](\d{4})/);
                if (match) m = match[2].padStart(2, '0') + '/' + match[3];
            }
            if (!agrupado[m]) agrupado[m] = [];
            agrupado[m].push(oc);
        });

        const tituloPeriodo = isRange ? parts[0] + ' a ' + parts[1] : periodo;
        const metasMensais = typeof rotasMap === 'string'
            ? JSON.parse(rotasMap)[cliente_id] || {}
            : rotasMap[cliente_id] || {};

        let dLoop = new Date(dtInicial);
        const mesesResultados = [];
        let somaRotasPeriodo = 0;
        let somaOcorrenciasPeriodo = 0;

        while (dLoop <= dtFinal) {
            const monthStr = String(dLoop.getMonth() + 1).padStart(2, '0') + '/' + dLoop.getFullYear();
            const rotasDesteMes     = metasMensais[monthStr] || 0;
            const ocorrenciasDesteMes = agrupado[monthStr] ? agrupado[monthStr].length : 0;

            somaRotasPeriodo        += rotasDesteMes;
            somaOcorrenciasPeriodo  += ocorrenciasDesteMes;

            let meta = 100;
            if (rotasDesteMes > 0) meta = ((rotasDesteMes - ocorrenciasDesteMes) / rotasDesteMes) * 100;

            let nivel = 'Limite Critico (Plano de Acao)';
            if (meta >= 99.0) nivel = 'Excelencia (Alta Performance)';
            else if (meta >= 97.0) nivel = 'Padrao de Mercado (Saudavel)';

            mesesResultados.push({
                mes:  monthStr,
                rotas: rotasDesteMes,
                ocorrencias: ocorrenciasDesteMes,
                meta: meta.toFixed(2).replace('.', ',') + '%',
                nivel,
                lista_ocorrencias_mes: agrupado[monthStr] || []
            });
            dLoop.setMonth(dLoop.getMonth() + 1);
        }

        let metaGeral = 100;
        if (somaRotasPeriodo > 0) metaGeral = ((somaRotasPeriodo - somaOcorrenciasPeriodo) / somaRotasPeriodo) * 100;
        let nivelGeral = 'Limite Critico (Plano de Acao)';
        if (metaGeral >= 99.0) nivelGeral = 'Excelencia (Alta Performance)';
        else if (metaGeral >= 97.0) nivelGeral = 'Padrao de Mercado (Saudavel)';

        const mediaRotasPeriodo = Math.round(somaRotasPeriodo / Math.max(1, mesesResultados.length));
        const mTolerancia = Math.round(mediaRotasPeriodo * 0.03);
        const mMeta       = Math.round(mediaRotasPeriodo * 0.01);
        const mPadraoMin  = Math.round(mediaRotasPeriodo * 0.02);
        const mCritico    = Math.round(mediaRotasPeriodo * 0.05);
        let mPeso = '0,000';
        if (mediaRotasPeriodo > 0) {
            mPeso = ((1 / mediaRotasPeriodo) * 100).toFixed(3).replace('.', ',');
        }

        const docData = {
            nome_cliente, titulo: isMensal ? periodo : 'Consolidado ' + tituloPeriodo,
            mes: tituloPeriodo, total_rotas: somaRotasPeriodo,
            media_rotas: mediaRotasPeriodo,
            rotas: isMensal ? somaRotasPeriodo : mediaRotasPeriodo,
            ocorrencias: somaOcorrenciasPeriodo,
            meta: metaGeral.toFixed(2).replace('.', ',') + '%',
            nivel: nivelGeral,
            tolerancia_ocorrencias: mTolerancia, meta_ocorrencias: mMeta,
            padrao_minimo: mPadraoMin, critico_ocorrencias: mCritico,
            peso_estatistico: mPeso,
            lista_ocorrencias: ocorrenciasList,
            meses: mesesResultados
        };

        const content = fs.readFileSync(templatePath, 'binary');
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
        doc.render(docData);
        const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
        lastBuf = buf;
        generatedFilesCount++;

        const safeCliente = nome_cliente.replace(/[^a-zA-Z0-9]/g, '_');
        const safeMonth   = periodo.replace(/\//g, '-');
        exportZip.file('SLA_' + safeCliente + '_' + safeMonth + '.docx', buf);
    }

    if (generatedFilesCount === 1) return { isZip: false, buf: lastBuf };
    const finalZipBuf = exportZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    return { isZip: true, buf: finalZipBuf };
}

module.exports = { gerarSLA, gerarSLAAutomatizado };
