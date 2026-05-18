const margens = { 'DROP': 31, '3PCS': 17, '6PCS': 15, '10PCS': 14, '20PCS': 12, '30PCS': 11, '50PCS': 9, '100PCS': 7, 'CAIXA FECHADA': 5 };

let produtos = JSON.parse(localStorage.getItem('neopoder_v6')) || [];

function save() {
    localStorage.setItem('neopoder_v6', JSON.stringify(produtos));
    render();
}

window.addProduct = function() {
    const nome = document.getElementById('p-nome').value;
    const vf = parseFloat(document.getElementById('p-preco').value);
    if(!nome || !vf) return alert("Preencha tudo!");

    produtos.push({ id: Date.now(), nome, vfBase: vf, ocultos: [] });
    save();
};

window.toggleFaixa = function(id, faixa) {
    const p = produtos.find(x => x.id === id);
    if(!p.ocultos) p.ocultos = []; // Correção do erro de undefined
    p.ocultos.includes(faixa) ? p.ocultos = p.ocultos.filter(f => f !== faixa) : p.ocultos.push(faixa);
    save();
};

window.excluir = function(id) { produtos = produtos.filter(x => x.id !== id); save(); };

function render() {
    const list = document.getElementById('product-list');
    list.innerHTML = produtos.map(p => `
        <div class="product-card">
            <div style="display:flex; justify-content:space-between">
                <h3>${p.nome} <small style="color:var(--brand-blue)">(VF: R$ ${p.vfBase})</small></h3>
                <button onclick="excluir(${p.id})" style="color:red; background:none; border:none; cursor:pointer">Remover</button>
            </div>
            <div class="pricing-grid">
                ${Object.keys(margens).map(f => {
                    const isOculto = (p.ocultos || []).includes(f);
                    return `
                        <div class="price-tier ${isOculto ? 'disabled' : ''}">
                            <span class="tier-name">${f}</span>
                            <span class="tier-price">${isOculto ? '--' : 'R$ ' + (p.vfBase + margens[f]).toFixed(2)}</span>
                            <button class="toggle-btn" onclick="toggleFaixa(${p.id}, '${f}')">${isOculto ? 'Ativar' : 'Ocultar'}</button>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `).join('');
}
render();