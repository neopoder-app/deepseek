// Função para carregar apenas produtos aprovados pelo Admin
function carregarProdutos() {
    const aprovados = JSON.parse(localStorage.getItem('produtos_publicos')) || [];
    const container = document.getElementById('container-produtos'); // Use o ID do seu HTML
    
    if (aprovados.length === 0) {
        container.innerHTML = "<p>Nenhum produto disponível no momento.</p>";
        return;
    }

    container.innerHTML = aprovados.map(p => `
        <div class="card-produto">
            <img src="public/assets/placeholder-camisa.jpg" alt="${p.nome}">
            <h3>${p.nome}</h3>
            <p class="preco">R$ ${(p.preco * (1 + p.margem/100)).toFixed(2)}</p>
            <button onclick="comprar('${p.nome}')">Pedir no WhatsApp</button>
        </div>
    `).join('');
}

// Chame a função ao carregar a página
window.onload = carregarProdutos;