window.sortOcorrencias = function() {
    window.ocorrenciasData.sort((a, b) => {
        const parseDate = (str) => {
            if (!str) return 0;
            const parts = str.split('/');
            if (parts.length === 3) return parseInt(parts[2] + parts[1] + parts[0], 10);
            return 0; 
        };
        return parseDate(a.data) - parseDate(b.data);
    });
};

window.addOcorrencia = function() {
    const id = Date.now();
    window.ocorrenciasData.push({ id, numero: '', data: '', descricao: '', status: '', cliente_id: '' });
    window.sortOcorrencias();
    window.renderOcorrencias();
};

window.removeOcorrencia = function(id) {
    window.ocorrenciasData = window.ocorrenciasData.filter(o => o.id !== id);
    window.sortOcorrencias();
    window.renderOcorrencias();
};

window.updateOcorrencia = function(id, field, value) {
    const index = window.ocorrenciasData.findIndex(o => o.id === id);
    if (index !== -1) {
        window.ocorrenciasData[index][field] = value;
        if (field === 'data') window.sortOcorrencias();
        if (field === 'cliente_id' || field === 'data') {
            window.renderOcorrencias();
        }
    }
};

window.renderNumbersOnly = function() {
    window.ocorrenciasData.forEach(oc => {
        const input = document.getElementById('numero_' + oc.id);
        if (input) {
            input.value = oc.numero || '';
        }
    });
};

window.updateVisualNumbers = async function() {
    const groups = {};
    for (const oc of window.ocorrenciasData) {
        if (!oc.cliente_id || !oc.data) {
            oc.numero = '';
            continue;
        }
        const match = oc.data.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
        if (!match) {
            oc.numero = '';
            continue;
        }
        const yearShort = match[3].slice(-2);
        const key = `${oc.cliente_id}_${yearShort}`;
        if (!groups[key]) {
            groups[key] = {
                cliente_id: oc.cliente_id,
                yearShort: yearShort,
                items: []
            };
        }
        groups[key].items.push(oc);
    }
    
    for (const key in groups) {
        const group = groups[key];
        const maxSeq = await window.getClientMaxNumber(group.cliente_id, group.yearShort);
        let currentSeq = maxSeq + 1;
        
        const clienteObj = window.clientesList.find(c => c.id === group.cliente_id);
        const nomeCliente = clienteObj ? clienteObj.nome : '';
        const clean = nomeCliente.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const prefix = clean.substring(0, 5) || 'CLI';

        for (const item of group.items) {
            item.numero = `${prefix}-${String(currentSeq).padStart(3, '0')}/${group.yearShort}`;
            currentSeq++;
        }
    }
    
    window.renderNumbersOnly();
};

window.renderOcorrencias = function() {
    const list = document.getElementById('ocorrenciasList');
    const emptyState = document.getElementById('emptyState');
    
    list.innerHTML = '';
    if (window.ocorrenciasData.length === 0) {
        emptyState.style.display = 'block';
        return;
    } else {
        emptyState.style.display = 'none';
    }

    let clientesOptions = '<option value="">-- Selecione o Cliente --</option>';
    window.clientesList.forEach(c => {
        clientesOptions += `<option value="${c.id}">${c.nome}</option>`;
    });

    window.ocorrenciasData.forEach((oc) => {
        const row = document.createElement('div');
        row.className = `p-4 rounded-lg border relative ${!oc.cliente_id ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200 shadow-sm'}`;
        
        const selectHtml = clientesOptions.replace(`value="${oc.cliente_id}"`, `value="${oc.cliente_id}" selected`);

        row.innerHTML = `
            <button type="button" onclick="removeOcorrencia(${oc.id})" class="absolute top-2 right-2 text-red-500 hover:text-red-700 bg-red-100 hover:bg-red-200 rounded-full w-6 h-6 flex items-center justify-center font-bold transition-colors">×</button>
            <div class="grid grid-cols-1 sm:grid-cols-12 gap-4">
                
                <div class="sm:col-span-12 md:col-span-5">
                    <label class="block text-xs font-bold ${!oc.cliente_id ? 'text-red-600' : 'text-blue-600'} mb-1">Empresa / Cliente *</label>
                    <select onchange="updateOcorrencia(${oc.id}, 'cliente_id', this.value)" class="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500 bg-white">
                        ${selectHtml}
                    </select>
                </div>
                
                <div class="sm:col-span-4 md:col-span-2">
                    <label class="block text-xs font-medium text-gray-500 mb-1">Nº</label>
                    <input type="text" id="numero_${oc.id}" value="${oc.numero || ''}" placeholder="..." class="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500 bg-blue-50 font-bold text-blue-700 cursor-not-allowed" readonly title="A numeração será gerada automaticamente de forma sequencial por cliente e ano.">
                </div>
                
                <div class="sm:col-span-8 md:col-span-5">
                    <label class="block text-xs font-medium text-gray-500 mb-1">Data</label>
                    <input type="text" value="${oc.data}" onchange="updateOcorrencia(${oc.id}, 'data', this.value)" placeholder="Ex: 19/05/2026" class="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500">
                </div>

                <div class="sm:col-span-12 md:col-span-6">
                    <label class="block text-xs font-medium text-gray-500 mb-1">Descrição</label>
                    <textarea rows="3" onchange="updateOcorrencia(${oc.id}, 'descricao', this.value)" class="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500">${oc.descricao}</textarea>
                </div>

                <div class="sm:col-span-12 md:col-span-6">
                    <label class="block text-xs font-medium text-gray-500 mb-1">Status / Resolução</label>
                    <textarea rows="3" onchange="updateOcorrencia(${oc.id}, 'status', this.value)" class="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500">${oc.status}</textarea>
                </div>
            </div>
        `;
        list.appendChild(row);
    });

    window.updateVisualNumbers();
};

window.salvarNoBanco = async function() {
    if (window.ocorrenciasData.length === 0) return;

    const hasInvalid = window.ocorrenciasData.some(o => !o.cliente_id);
    if (hasInvalid) {
        window.showToast("Atenção: Há ocorrências sem cliente associado. Selecione um cliente nas caixas destacadas em vermelho.", "warning");
        return;
    }

    const btn = document.getElementById('salvarBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Salvando...';
    btn.disabled = true;
    btn.classList.add('opacity-75', 'cursor-not-allowed');

    const payload = window.ocorrenciasData.map(o => ({
        cliente_id: o.cliente_id,
        numero_original: o.numero,
        data: o.data,
        descricao: o.descricao,
        status: o.status
    }));

    try {
        const res = await fetch('/api/ocorrencias/lote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ocorrencias: payload })
        });

        if (res.ok) {
            window.ocorrenciasData = []; 
            for (let key in window.clientNumbersCache) delete window.clientNumbersCache[key]; 
            window.showToast("Ocorrências salvas no banco com sucesso!", "success");
            window.renderOcorrencias();
        } else {
            const err = await res.json();
            window.showToast("Erro ao salvar: " + err.error, "error");
        }
    } catch (error) {
        console.error(error);
        window.showToast("Erro de conexão com o servidor.", "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        btn.classList.remove('opacity-75', 'cursor-not-allowed');
    }
};
