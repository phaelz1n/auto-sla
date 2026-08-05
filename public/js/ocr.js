// ─── Utilitários de normalização ────────────────────────────────────────────
const normalizeStr = (s) => s
    ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, '')
    : '';

// ─── Limpa texto OCR: remove cabeçalho/rodapé da Trans Pinho ────────────────
function limparTextoOcr(text) {
    // Remove linhas que contenham informações da Trans Pinho (remetente)
    const linhasParaRemover = [
        /trans\s*pinho/i,
        /rua\s+fl[oó]rida/i,
        /bairro\s+nossa\s+ch[aá]cara/i,
        /cep\s+\d{5}/i,
        /fone\s+\d/i,
        /site:\s*www\./i,
        /e-?mail:\s*\S+@/i,
        /transpinho\.com/i,
        /gravata[ií]\s*[—\-]\s*cep/i,
    ];

    const linhas = text.split('\n');
    const linhasFiltradas = linhas.filter(linha => {
        const l = linha.trim();
        if (!l) return true; // preserva linhas vazias
        return !linhasParaRemover.some(re => re.test(l));
    });
    let textoLimpo = linhasFiltradas.join('\n');

    // Descarta tudo antes do início real do documento
    // (procura por "A Perto", "Conforme solicitado" ou "OCORRÊNCIA")
    const inicioMatch = textoLimpo.search(/(?:A Perto|Conforme solicitado|OCORR[EÊ]NCIA)/i);
    if (inicioMatch > 0) {
        textoLimpo = textoLimpo.substring(inicioMatch);
    }

    return textoLimpo;
}

// ─── Parser específico das ocorrências da Perto ─────────────────────────────
function parsePerto(rawText) {
    const text = limparTextoOcr(rawText);
    const extract = (regex) => {
        const match = text.match(regex);
        return match ? match[1].trim() : '';
    };

    // Número da ocorrência — Ex: "001/2026" ou "062/2026"
    const numero = extract(/OCORR[EÊ]NCIA[:\s]+([\d]+\/[\d]+)/i);

    // Linha do ônibus
    const linha = extract(/LINHA[:\s]+([\w\s\.]+?)(?:\n|ENTRADA|RETORNO|$)/i);

    // Descritivo — tudo entre DESCRITIVO: e RESOLUÇÃO:
    const descritivoMatch = text.match(/DESCRITIVO[:\s]+([\s\S]*?)(?:RESOLU[CÇ][AÃ]O[:\s]|$)/i);
    const descritivo = descritivoMatch ? descritivoMatch[1].trim() : '';

    // Resolução — tudo após RESOLUÇÃO:
    const resolucaoMatch = text.match(/RESOLU[CÇ][AÃ]O[:\s]+([\s\S]*?)$/i);
    const resolucao = resolucaoMatch ? resolucaoMatch[1].trim() : '';

    // Data do ocorrido — extrai do descritivo (ex: "dia 07/01", "dia 07/01/2026", ou cabeçalho)
    let dataStr = '';

    // 1) Tenta data completa no texto (dd/mm/yyyy)
    const dataCompletaMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dataCompletaMatch) {
        const d = dataCompletaMatch[1].padStart(2, '0');
        const m = dataCompletaMatch[2].padStart(2, '0');
        const y = dataCompletaMatch[3];
        dataStr = `${d}/${m}/${y}`;
    }

    // 2) Tenta capturar "dia DD/MM" no descritivo e pegar o ano do cabeçalho
    if (!dataStr || dataStr === '') {
        const diaMatch = descritivo.match(/(?:dia|em)\s+(\d{1,2})[\/\-](\d{1,2})(?!\/)/i);
        if (diaMatch) {
            // Tenta pegar ano do cabeçalho (ex: "Gravataí, 10 de Dezembro de 2025")
            const anoHeaderMatch = text.match(/,?\s+\d{1,2}\s+de\s+\w+\s+de\s+(\d{4})/i);
            const anoBody = text.match(/(\d{4})/); // fallback
            const ano = (anoHeaderMatch && anoHeaderMatch[1]) || (anoBody && anoBody[1]) || String(new Date().getFullYear());
            const d = diaMatch[1].padStart(2, '0');
            const m = diaMatch[2].padStart(2, '0');
            dataStr = `${d}/${m}/${ano}`;
        }
    }

    // 3) Tenta cabeçalho por extenso: "10 de Dezembro de 2025"
    if (!dataStr) {
        const mesesPt = { janeiro:1,fevereiro:2,março:3,marco:3,abril:4,maio:5,junho:6,julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12 };
        const porExtensoMatch = text.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
        if (porExtensoMatch) {
            const nomeMes = porExtensoMatch[2].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const numMes = mesesPt[nomeMes];
            if (numMes) {
                dataStr = `${porExtensoMatch[1].padStart(2,'0')}/${String(numMes).padStart(2,'0')}/${porExtensoMatch[3]}`;
            }
        }
    }

    // Tenta identificar o cliente no texto
    let matchedClientId = '';
    const pertoCliente = window.clientesList.find(c => normalizeStr(c.nome).includes('PERTO'));
    if (pertoCliente) matchedClientId = pertoCliente.id;

    // Monta descricao com linha se disponível
    const descricaoFinal = linha
        ? `Linha: ${linha.trim()}.\n${descritivo}`
        : descritivo;

    return {
        numero,
        data: dataStr,
        descricao: descricaoFinal.trim(),
        status: resolucao,
        cliente_id: matchedClientId,
        _campos_faltando: {
            numero: !numero,
            data: !dataStr,
            descricao: !descritivo,
            status: !resolucao,
            cliente_id: !matchedClientId
        }
    };
}

// ─── Parser genérico (prints de imagem) ─────────────────────────────────────
function parseGenerico(text) {
    const extract = (regex) => {
        const match = text.match(regex);
        return match ? match[1].trim() : '';
    };

    let dataStr = extract(/Data:\s*(.+)/i);
    if (dataStr) {
        const dateMatch = dataStr.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
        if (dateMatch) {
            let d = dateMatch[1].padStart(2, '0');
            let m = dateMatch[2].padStart(2, '0');
            let y = dateMatch[3];
            if (y.length === 2) y = "20" + y;
            dataStr = `${d}/${m}/${y}`;
        } else { dataStr = ''; }
    }
    const empresa = extract(/Empresa:\s*(.+)/i);
    const rota = extract(/Rota:\s*(.+)/i);
    const motorista = extract(/Motorista:\s*(.+)/i);
    const impacto = extract(/Impacto:\s*(.+)/i);
    const tempoSocorro = extract(/Tempo de socorro:\s*(.+)/i);
    const responsavel = extract(/Operacional responsável:\s*(.+)/i);
    const ocorrenciaPerto = extract(/OCORR[EÊ]NCIA[:\s]+([\d]+\/[\d]+)/i);
    const linhaPerto = extract(/LINHA[:\s]+([\w\s\.]+?)(?:\n|ENTRADA|RETORNO|$)/i);

    const detalheMatch = text.match(/Detalhe do ocorrido:\s*([\s\S]*?)(?:Operacional responsável:|$)/i);
    let detalhe = detalheMatch ? detalheMatch[1].trim() : '';
    const descritivoPertoMatch = text.match(/DESCRITIVO[:\s]+([\s\S]*?)(?:RESOLU[CÇ][AÃ]O[:\s]|$)/i);
    if (descritivoPertoMatch) detalhe = descritivoPertoMatch[1].trim();

    let descParts = [];
    if (empresa) descParts.push(`Empresa: ${empresa}`);
    if (linhaPerto) descParts.push(`Linha: ${linhaPerto}`);
    if (rota) descParts.push(`(Rota: ${rota})`);
    if (motorista) descParts.push(`- Motorista: ${motorista}`);
    const cabecalhoDesc = descParts.join(' ');
    const descricaoCompleta = cabecalhoDesc ? `${cabecalhoDesc}.\nDetalhe: ${detalhe}` : detalhe;

    let statusParts = [];
    if (impacto) statusParts.push(`Impacto: ${impacto}`);
    if (tempoSocorro) statusParts.push(`Tempo socorro: ${tempoSocorro}`);
    if (responsavel) statusParts.push(`(Resp: ${responsavel})`);
    let statusCompleto = statusParts.join(' - ');
    const resolucaoPertoMatch = text.match(/RESOLU[CÇ][AÃ]O[:\s]+([\s\S]*?)$/i);
    if (resolucaoPertoMatch) statusCompleto = resolucaoPertoMatch[1].trim();

    let matchedClientId = '';
    if (empresa) {
        const empresaNorm = normalizeStr(empresa);
        const found = window.clientesList.find(c => {
            const cNomeNorm = normalizeStr(c.nome);
            return empresaNorm.includes(cNomeNorm) || cNomeNorm.includes(empresaNorm);
        });
        if (found) matchedClientId = found.id;
    }
    if (!matchedClientId) {
        const fullTextNorm = normalizeStr(text);
        const foundFallback = window.clientesList.find(c => {
            const cNomeNorm = normalizeStr(c.nome);
            return cNomeNorm.length > 3 && fullTextNorm.includes(cNomeNorm);
        });
        if (foundFallback) matchedClientId = foundFallback.id;
    }

    return {
        numero: ocorrenciaPerto || '',
        data: dataStr || '',
        descricao: descricaoCompleta.trim(),
        status: statusCompleto.trim(),
        cliente_id: matchedClientId,
        _campos_faltando: {}
    };
}

// ─── Modal de revisão quando campos estão faltando ───────────────────────────
window.abrirModalRevisaoPerto = function(ocorrencia, onConfirm) {
    // Remove modal anterior se existir
    const existing = document.getElementById('modalRevisaoPerto');
    if (existing) existing.remove();

    const falta = ocorrencia._campos_faltando || {};
    const alertas = [];
    if (falta.numero) alertas.push('número da ocorrência');
    if (falta.data) alertas.push('data do ocorrido');
    if (falta.descricao) alertas.push('descritivo');
    if (falta.status) alertas.push('resolução');
    if (falta.cliente_id) alertas.push('cliente');

    let clientesOptions = '<option value="">-- Selecione o Cliente --</option>';
    window.clientesList.forEach(c => {
        const sel = c.id === ocorrencia.cliente_id ? ' selected' : '';
        clientesOptions += `<option value="${c.id}"${sel}>${c.nome}</option>`;
    });

    const modal = document.createElement('div');
    modal.id = 'modalRevisaoPerto';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div class="bg-gradient-to-r from-orange-500 to-red-500 px-6 py-4 flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <div>
                    <h3 class="text-white font-bold text-lg">Revisão Necessária</h3>
                    <p class="text-orange-100 text-xs">Não foi possível reconhecer: <strong>${alertas.join(', ')}</strong></p>
                </div>
            </div>
            <div class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-600 mb-1">Nº Ocorrência <span class="text-orange-500">${falta.numero ? '⚠ não reconhecido' : '✓'}</span></label>
                        <input id="rev_numero" type="text" value="${ocorrencia.numero || ''}" placeholder="Ex: 001/2026" class="w-full px-3 py-2 border ${falta.numero ? 'border-orange-400 bg-orange-50' : 'border-gray-300'} rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-600 mb-1">Data do Ocorrido <span class="text-orange-500">${falta.data ? '⚠ não reconhecida' : '✓'}</span></label>
                        <input id="rev_data" type="text" value="${ocorrencia.data || ''}" placeholder="Ex: 07/01/2026" class="w-full px-3 py-2 border ${falta.data ? 'border-orange-400 bg-orange-50' : 'border-gray-300'} rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                    </div>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-600 mb-1">Cliente <span class="text-orange-500">${falta.cliente_id ? '⚠ não reconhecido' : '✓'}</span></label>
                    <select id="rev_cliente" class="w-full px-3 py-2 border ${falta.cliente_id ? 'border-orange-400 bg-orange-50' : 'border-gray-300'} rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                        ${clientesOptions}
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-600 mb-1">Descritivo <span class="text-orange-500">${falta.descricao ? '⚠ não reconhecido' : '✓'}</span></label>
                    <textarea id="rev_descricao" rows="3" placeholder="Descreva o ocorrido..." class="w-full px-3 py-2 border ${falta.descricao ? 'border-orange-400 bg-orange-50' : 'border-gray-300'} rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none">${ocorrencia.descricao || ''}</textarea>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-600 mb-1">Resolução <span class="text-orange-500">${falta.status ? '⚠ não reconhecida' : '✓'}</span></label>
                    <textarea id="rev_status" rows="3" placeholder="Descreva a resolução..." class="w-full px-3 py-2 border ${falta.status ? 'border-orange-400 bg-orange-50' : 'border-gray-300'} rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none">${ocorrencia.status || ''}</textarea>
                </div>
            </div>
            <div class="px-6 py-4 bg-gray-50 flex gap-3 justify-end border-t">
                <button id="rev_pular" class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium transition-colors">Pular este PDF</button>
                <button id="rev_confirmar" class="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg shadow transition-all">
                    Confirmar e Lançar
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('rev_confirmar').addEventListener('click', () => {
        const updated = {
            ...ocorrencia,
            numero: document.getElementById('rev_numero').value.trim(),
            data: document.getElementById('rev_data').value.trim(),
            cliente_id: document.getElementById('rev_cliente').value,
            descricao: document.getElementById('rev_descricao').value.trim(),
            status: document.getElementById('rev_status').value.trim(),
        };
        modal.remove();
        onConfirm(updated);
    });

    document.getElementById('rev_pular').addEventListener('click', () => {
        modal.remove();
        onConfirm(null);
    });
};

// ─── Renderiza canvas de página PDF como imagem e faz OCR ────────────────────
async function ocrPaginaPdf(page, scale, btnText, label) {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    return new Promise((resolve, reject) => {
        canvas.toBlob(async (blob) => {
            try {
                const result = await Tesseract.recognize(blob, 'por', {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            const pct = Math.round(m.progress * 100);
                            btnText.innerText = `${label} ${pct}%`;
                        }
                    }
                });
                resolve(result.data.text);
            } catch(e) { reject(e); }
        }, 'image/png');
    });
}

// ─── Processa ocorrência extraída e lança (com revisão se necessário) ─────────
async function processarOcorrenciaExtraida(parsed, fileIndex) {
    const temFaltando = Object.values(parsed._campos_faltando || {}).some(v => v);

    if (temFaltando) {
        return new Promise((resolve) => {
            window.abrirModalRevisaoPerto(parsed, (updated) => {
                if (updated) {
                    const id = Date.now() + fileIndex;
                    window.ocorrenciasData.push({ id, ...updated });
                    window.sortOcorrencias();
                    window.renderOcorrencias();
                }
                resolve();
            });
        });
    } else {
        const id = Date.now() + fileIndex;
        window.ocorrenciasData.push({ id, ...parsed });
        window.sortOcorrencias();
        window.renderOcorrencias();
    }
}

// ─── Handler: upload de PDF (Perto) ──────────────────────────────────────────
window.handlePdfPertoUpload = async function(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    const btnText = document.getElementById('pdfBtnText');
    const originalText = 'Ler PDF (Perto)';

    // Aguarda pdf.js carregar (módulo ESM é assíncrono)
    if (!window.pdfjsLib) {
        btnText.innerText = 'Carregando biblioteca PDF...';
        let tentativas = 0;
        while (!window.pdfjsLib && tentativas < 50) {
            await new Promise(r => setTimeout(r, 100));
            tentativas++;
        }
        if (!window.pdfjsLib) {
            btnText.innerText = originalText;
            window.showToast('Biblioteca PDF não carregada. Recarregue a página e tente novamente.', 'error');
            return;
        }
    }

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        btnText.innerText = `Carregando PDF ${i+1}/${files.length}...`;

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const numPages = pdfDoc.numPages;

            let fullText = '';
            for (let p = 1; p <= numPages; p++) {
                const page = await pdfDoc.getPage(p);
                const label = `PDF ${i+1}/${files.length} — pág. ${p}/${numPages}`;
                const pageText = await ocrPaginaPdf(page, 2.0, btnText, label);
                fullText += pageText + '\n';
            }

            const parsed = parsePerto(fullText);
            await processarOcorrenciaExtraida(parsed, i);

        } catch (e) {
            console.error('Erro ao processar PDF:', e);
            window.showToast(`Erro ao processar PDF ${i+1}: ${e.message}`, 'error');
        }
    }

    btnText.innerText = originalText;
    event.target.value = '';
};

// ─── Handler: upload de imagem/print (genérico) ──────────────────────────────
window.handleOcrUpload = async function(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    const btnText = document.getElementById('ocrBtnText');
    const originalText = 'Ler de um Print';

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        btnText.innerText = `Lendo ${i+1}/${files.length}... 0%`;

        try {
            const result = await Tesseract.recognize(file, 'por', {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        btnText.innerText = `Lendo ${i+1}/${files.length}... ${Math.round(m.progress * 100)}%`;
                    }
                }
            });

            const parsed = parseGenerico(result.data.text);
            await processarOcorrenciaExtraida(parsed, i);

        } catch (e) {
            console.error(e);
            window.showToast(`Erro ao processar a imagem ${i+1}. Tente novamente.`, 'error');
        }
    }

    btnText.innerText = originalText;
    event.target.value = '';
};

window.addEventListener('paste', async (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    const tab = document.getElementById('tab-lancamento');
    if (!tab || tab.classList.contains('hidden')) return;

    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            const fileList = new DataTransfer();
            fileList.items.add(blob);
            window.handleOcrUpload({ target: { files: fileList.files } });
            break;
        }
    }
});
