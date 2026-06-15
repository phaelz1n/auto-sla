document.addEventListener('DOMContentLoaded', async () => {
    await window.fetchClientes();
    window.renderOcorrencias();

    const tipoExportacaoSelect = document.getElementById('tipo_exportacao_gerar');
    const periodoInicialSelect = document.getElementById('periodo_inicial');
    const periodoFinalSelect = document.getElementById('periodo_final');
    
    const gerarInputsMetas = () => {
        const container = document.getElementById('container_metas_rotas');
        const pIni = periodoInicialSelect.value;
        const pFim = (tipoExportacaoSelect.value === 'mensal') ? pIni : (periodoFinalSelect.value || pIni);
        
        if (!pIni) {
            container.innerHTML = '<div class="text-xs text-gray-400 col-span-full">Selecione o período inicial.</div>';
            return;
        }

        const [m1, y1] = pIni.split('/');
        const [m2, y2] = pFim.split('/');
        let d1 = new Date(y1, parseInt(m1) - 1, 1);
        const d2 = new Date(y2, parseInt(m2) - 1, 1);
        
        if (d2 < d1) {
            container.innerHTML = '<div class="text-xs text-red-400 col-span-full">Período Final não pode ser menor que o Inicial.</div>';
            return;
        }

        let html = '';
        while (d1 <= d2) {
            const monthStr = String(d1.getMonth() + 1).padStart(2, '0') + '/' + d1.getFullYear();
            html += `
                <div>
                    <label class="block text-xs font-semibold text-gray-600 mb-1">${monthStr}</label>
                    <input type="number" class="input-meta-rota w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500" data-mes="${monthStr}" placeholder="Rotas" required min="1">
                </div>
            `;
            d1.setMonth(d1.getMonth() + 1);
        }
        container.innerHTML = html;
    };

    if (tipoExportacaoSelect) {
        tipoExportacaoSelect.addEventListener('change', (e) => {
            const divFinal = document.getElementById('div_periodo_final');
            if (e.target.value === 'mensal') {
                divFinal.classList.add('hidden');
                periodoFinalSelect.value = '';
            } else {
                divFinal.classList.remove('hidden');
            }
            gerarInputsMetas();
        });
    }
    
    if (periodoInicialSelect) periodoInicialSelect.addEventListener('change', gerarInputsMetas);
    if (periodoFinalSelect) periodoFinalSelect.addEventListener('change', gerarInputsMetas);
});
