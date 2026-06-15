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
            
            const text = result.data.text;
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
                } else {
                    dataStr = ''; 
                }
            }
            const empresa = extract(/Empresa:\s*(.+)/i);
            const rota = extract(/Rota:\s*(.+)/i);
            const motorista = extract(/Motorista:\s*(.+)/i);
            const impacto = extract(/Impacto:\s*(.+)/i);
            const tempoSocorro = extract(/Tempo de socorro:\s*(.+)/i);
            const responsavel = extract(/Operacional responsável:\s*(.+)/i);
            
            const detalheMatch = text.match(/Detalhe do ocorrido:\s*([\s\S]*?)(?:Operacional responsável:|$)/i);
            const detalhe = detalheMatch ? detalheMatch[1].trim() : '';

            let descParts = [];
            if (empresa) descParts.push(`Empresa: ${empresa}`);
            if (rota) descParts.push(`(Rota: ${rota})`);
            if (motorista) descParts.push(`- Motorista: ${motorista}`);
            const cabecalhoDesc = descParts.join(' ');
            const descricaoCompleta = cabecalhoDesc ? `${cabecalhoDesc}.\nDetalhe: ${detalhe}` : detalhe;

            let statusParts = [];
            if (impacto) statusParts.push(`Impacto: ${impacto}`);
            if (tempoSocorro) statusParts.push(`Tempo socorro: ${tempoSocorro}`);
            if (responsavel) statusParts.push(`(Resp: ${responsavel})`);
            const statusCompleto = statusParts.join(' - ');

            let matchedClientId = '';
            const normalizeStr = (s) => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
            
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
                if (foundFallback) {
                    matchedClientId = foundFallback.id;
                }
            }

            const id = Date.now() + i;
            window.ocorrenciasData.push({
                id,
                cliente_id: matchedClientId,
                numero: '',
                data: dataStr || '',
                descricao: descricaoCompleta.trim(),
                status: statusCompleto.trim()
            });

            window.sortOcorrencias();
            window.renderOcorrencias();
        } catch (e) {
            console.error(e);
            window.showToast(`Erro ao processar a imagem ${i+1}. Tente novamente.`, "error");
        }
    }
    
    btnText.innerText = originalText;
    event.target.value = '';
};

window.addEventListener('paste', async (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
    }
    if (document.getElementById('tab-lancamento').classList.contains('hidden-tab') || document.getElementById('tab-lancamento').classList.contains('hidden')) return;

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
