window.deletarOcorrencia = async function(id) {
    try {
        const res = await fetch(`/api/ocorrencias/${id}`, { method: 'DELETE' });
        if (res.ok) {
            const clienteId = document.getElementById('select_cliente_relatorio').value;
            window.buscarOcorrenciasCliente(clienteId);
        } else {
            const data = await res.json();
            window.showToast("Erro ao deletar: " + data.error, "error");
        }
    } catch (err) {
        window.showToast("Erro ao deletar: " + err.message, "error");
    }
};

window.buscarOcorrenciasCliente = async function(cliente_id) {
    const divResultado = document.getElementById('resultadoOcorrenciasCliente');
    const divVazia = document.getElementById('buscaVazia');
    const listaDiv = document.getElementById('listaOcorrenciasCliente');
    
    if (!cliente_id) {
        divResultado.classList.add('hidden');
        divVazia.classList.remove('hidden');
        divVazia.innerText = "Selecione um cliente acima para visualizar o histórico de ocorrências.";
        return;
    }

    listaDiv.innerHTML = '<div class="text-center text-gray-500 py-4">Buscando na nuvem...</div>';
    divVazia.classList.add('hidden');
    divResultado.classList.remove('hidden');

    try {
        const res = await fetch(`/api/ocorrencias/${cliente_id}`);
        const data = await res.json();
        
        if (res.ok) {
            if (data.length === 0) {
                listaDiv.innerHTML = '<div class="text-center text-gray-500 py-4">Nenhuma ocorrência salva para este cliente.</div>';
                document.getElementById('periodo_inicial').innerHTML = '<option value="">--</option>';
                document.getElementById('periodo_final').innerHTML = '<option value="">-- Igual Inicial --</option>';
            } else {
                const vistos = new Set();
                data.forEach(oc => {
                    oc.isDuplicate = false;
                    if (oc.data && oc.descricao) {
                        const descStr = String(oc.descricao).substring(0,30).toLowerCase().replace(/\s+/g,'');
                        const chave = `${oc.data}_${descStr}`;
                        if (vistos.has(chave)) {
                            oc.isDuplicate = true;
                        } else {
                            vistos.add(chave);
                        }
                    }
                });

                listaDiv.innerHTML = data.map(oc => `
                    <div class="border-b border-gray-200 pb-3 mb-3 last:border-0 last:mb-0 last:pb-0 ${oc.isDuplicate ? 'bg-yellow-50 p-2 rounded border border-yellow-200' : ''}">
                        <div class="flex justify-between items-start mb-1">
                            <div class="flex items-center gap-2">
                                <span class="text-xs font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Data: ${oc.data || 'S/ Data'}</span>
                                ${oc.isDuplicate ? '<span class="text-xs font-bold bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded">⚠️ Possível Duplicata</span>' : ''}
                            </div>
                            <div class="flex items-center gap-3">
                                <span class="text-xs text-gray-500 font-mono font-bold">Nº: ${oc.numero_original || '-'}</span>
                                <button type="button" onclick="deletarOcorrencia('${oc.id}')" class="text-red-500 hover:text-red-700 p-1" title="Excluir Ocorrência">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                        </div>
                        <div class="text-gray-800 mb-1 text-sm"><strong>Descrição:</strong> ${oc.descricao}</div>
                        <div class="text-gray-600 text-sm"><strong>Resolução:</strong> ${oc.status}</div>
                    </div>
                `).join('');

                const meses = new Set();
                data.forEach(oc => {
                    if (oc.data) {
                        const match = oc.data.match(/(\d{2})\/(\d{4})/);
                        if (match) meses.add(`${match[1]}/${match[2]}`);
                    }
                });
                
                const mesesArr = Array.from(meses).sort((a, b) => {
                    const [ma, ya] = a.split('/');
                    const [mb, yb] = b.split('/');
                    return new Date(ya, ma - 1) - new Date(yb, mb - 1);
                });

                const selIni = document.getElementById('periodo_inicial');
                const selFim = document.getElementById('periodo_final');
                
                selIni.innerHTML = '<option value="">-- Selecione --</option>' + mesesArr.map(m => `<option value="${m}">${m}</option>`).join('');
                selFim.innerHTML = '<option value="">-- Igual Inicial --</option>' + mesesArr.map(m => `<option value="${m}">${m}</option>`).join('');
            }
        } else {
            listaDiv.innerHTML = `<div class="text-red-500 py-4">Erro: ${data.error}</div>`;
        }
    } catch (err) {
        console.error(err);
        listaDiv.innerHTML = '<div class="text-red-500 py-4">Erro de conexão.</div>';
    }
};

window.regerarNumeracao = async function() {
    if (!confirm("Tem certeza que deseja recalcular a numeração de todas as ocorrências passadas? O padrão será refeito seguindo a regra sequencial.")) return;
    
    const btn = document.getElementById('btnRegerar');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Processando...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/ocorrencias/regerar-numeros', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
            window.showToast(data.message, "success");
            const clienteId = document.getElementById('select_cliente_relatorio').value;
            if (clienteId) window.buscarOcorrenciasCliente(clienteId);
        } else {
            window.showToast("Erro: " + data.error, "error");
        }
    } catch (err) {
        window.showToast("Erro de conexão.", "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

window.gerarSlaCliente = async function(e) {
    e.preventDefault();

    const cliente_id = document.getElementById('select_cliente_relatorio').value;
    if (!cliente_id) {
        window.showToast("Selecione um cliente primeiro.", "warning");
        return;
    }

    const pIni = document.getElementById('periodo_inicial').value;
    const pFim = document.getElementById('periodo_final').value || pIni;
    
    if (!pIni) {
        window.showToast("Selecione o Período Inicial.", "warning");
        return;
    }

    const periodo = (pIni === pFim) ? pIni : `${pIni}-${pFim}`;
    const exportType = document.getElementById('tipo_exportacao_gerar').value;
    const logoInput = document.getElementById('logo_gerar');
    
    const metasInputs = document.querySelectorAll('.input-meta-rota');
    const metasMensais = {};
    metasInputs.forEach(input => {
        metasMensais[input.getAttribute('data-mes')] = parseInt(input.value) || 0;
    });

    const clientesListPayload = [cliente_id];
    const rotasMap = { [cliente_id]: metasMensais };

    const formData = new FormData();
    formData.append('periodo', periodo);
    formData.append('clientes', JSON.stringify(clientesListPayload));
    formData.append('rotas', JSON.stringify(rotasMap));
    formData.append('tipo_exportacao', exportType);
    if (logoInput.files[0]) {
        formData.append('logo', logoInput.files[0]);
    }

    const btn = document.getElementById('gerarBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Baixando...';
    btn.disabled = true;
    btn.classList.add('opacity-75', 'cursor-not-allowed');

    try {
        const response = await fetch('/api/gerar-sla-novo', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            let filename = 'SLA_Gerado.docx';
            const disposition = response.headers.get('content-disposition');
            if (disposition && disposition.indexOf('attachment') !== -1) {
                const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                const matches = filenameRegex.exec(disposition);
                if (matches != null && matches[1]) { 
                    filename = matches[1].replace(/['"]/g, '');
                }
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } else {
            const err = await response.text();
            window.showToast("Erro ao gerar documento: " + err, "error");
        }
    } catch (error) {
        console.error(error);
        window.showToast("Erro de conexão ao gerar SLA.", "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        btn.classList.remove('opacity-75', 'cursor-not-allowed');
    }
};
