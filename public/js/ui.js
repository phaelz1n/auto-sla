window.showToast = function(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    let bgClass = 'bg-gray-800';
    let icon = '';
    
    if (type === 'success') {
        bgClass = 'bg-green-600';
        icon = '✓';
    } else if (type === 'error') {
        bgClass = 'bg-red-600';
        icon = '✕';
    } else if (type === 'warning') {
        bgClass = 'bg-yellow-500 text-gray-900';
        icon = '⚠️';
    }

    toast.className = `flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium transition-all duration-300 transform translate-y-10 opacity-0 ${bgClass}`;
    if (type === 'warning') toast.classList.remove('text-white');
    
    toast.innerHTML = `<span class="font-bold text-lg">${icon}</span> <span>${message}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.remove('translate-y-10', 'opacity-0');
    }, 10);
    
    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

window.switchTab = function(tabId) {
    document.getElementById('tab-lancamento').classList.add('hidden');
    document.getElementById('tab-relatorios').classList.add('hidden');
    
    document.getElementById('tab-lancamento-btn').classList.remove('border-blue-500', 'text-blue-600', 'bg-blue-50/50');
    document.getElementById('tab-lancamento-btn').classList.add('border-transparent', 'text-gray-500');
    document.getElementById('tab-relatorios-btn').classList.remove('border-blue-500', 'text-blue-600', 'bg-blue-50/50');
    document.getElementById('tab-relatorios-btn').classList.add('border-transparent', 'text-gray-500');

    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    document.getElementById(`tab-${tabId}-btn`).classList.remove('border-transparent', 'text-gray-500');
    document.getElementById(`tab-${tabId}-btn`).classList.add('border-blue-500', 'text-blue-600', 'bg-blue-50/50');
};
