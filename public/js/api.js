window.fetchClientes = async function() {
    try {
        const res = await fetch('/api/clientes');
        const data = await res.json();
        if (res.ok) {
            window.clientesList = data || [];
            const selectRelatorio = document.getElementById('select_cliente_relatorio');
            if (selectRelatorio) {
                selectRelatorio.innerHTML = '<option value="">-- Selecione o Cliente --</option>' + 
                    window.clientesList.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
            }
        } else {
            window.showToast("Erro de Servidor: Não foi possível carregar a lista de clientes.", "error");
        }
    } catch (e) {
        console.error("Erro ao buscar clientes:", e);
        window.showToast("Erro de Conexão ao buscar clientes.", "error");
    }
};

window.getClientMaxNumber = async function(cliente_id, year) {
    if (!window.clientNumbersCache[cliente_id]) {
        try {
            const res = await fetch('/api/ocorrencias/numeros-atuais/' + cliente_id);
            const data = await res.json();
            window.clientNumbersCache[cliente_id] = {};
            if (Array.isArray(data)) {
                for (const row of data) {
                    if (row.numero_original) {
                        const match = row.numero_original.match(/(?:.*-)?(\d+)\/(\d{2})$/);
                        if (match) {
                            const seq = parseInt(match[1], 10);
                            const y = match[2];
                            if (!window.clientNumbersCache[cliente_id][y] || seq > window.clientNumbersCache[cliente_id][y]) {
                                window.clientNumbersCache[cliente_id][y] = seq;
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Erro ao buscar numerações:", e);
            return 0;
        }
    }
    return window.clientNumbersCache[cliente_id][year] || 0;
};
