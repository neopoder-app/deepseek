// --- CONFIGURAÇÕES INICIAIS ---
const NUMERO_WHATSAPP = "5511915184857";
let bancoDeProdutos = [];
let carrinho = [];

// 1. CARREGAR OS PRODUTOS DO JSON REAL
async function carregarProdutos() {
    try {
        const resposta = await fetch('banco_produtos.json');
        bancoDeProdutos = await resposta.json();
        renderizarProdutos(bancoDeProdutos);
    } catch (erro) {
        console.error("Erro ao carregar o banco de produtos:", erro);
        document.getElementById('grid-produtos').innerHTML = "<p>Erro ao carregar os produtos. Verifique se o arquivo banco_produtos.json está na mesma pasta.</p>";
    }
}

// 2. DESENHAR PRODUTOS NA TELA (Lendo os campos reais do seu JSON)
function renderizarProdutos(listaProdutos) {
    const grid = document.getElementById('grid-produtos');
    grid.innerHTML = "";

    // Filtra apenas produtos com status ativo
    const produtosAtivos = listaProdutos.filter(p => p.status === "ativo");

    produtosAtivos.forEach(produto => {
        const precoDrop = produto.precosAtacado.drop; 
        const precoAtacadoMax = produto.precosAtacado.at_50;

        grid.innerHTML += `
            <div class="produto-card" style="${produto.esgotado ? 'opacity: 0.6;' : ''}">
                <img src="${produto.img}" alt="${produto.nome}">
                <h3>${produto.nome}</h3>
                <p class="preco-destaque">Atacado: R$ ${precoAtacadoMax.toFixed(2)}</p>
                <p style="font-size: 13px; margin-bottom: 10px; color:#666;">Drop/Varejo: R$ ${precoDrop.toFixed(2)}</p>
                ${produto.esgotado ? 
                    `<button class="btn-comprar" style="background:#888; cursor:not-allowed;" disabled>Esgotado</button>` : 
                    `<button class="btn-comprar" onclick="adicionarAoCarrinho('${produto.id}')">Adicionar ao Carrinho</button>`
                }
            </div>
        `;
    });
}

// 3. FILTRO DE CATEGORIAS DO MENU
function filtrar(categoria) {
    if (categoria === 'Todas') {
        renderizarProdutos(bancoDeProdutos);
    } else {
        const filtrados = bancoDeProdutos.filter(p => p.categoria === categoria);
        renderizarProdutos(filtrados);
    }
}

// 4. LÓGICA DO CARRINHO DE COMPRAS
function adicionarAoCarrinho(idProduto) {
    const produto = bancoDeProdutos.find(p => p.id === idProduto);
    const itemExistente = carrinho.find(item => item.produto.id === idProduto);

    if (itemExistente) {
        itemExistente.quantidade++;
    } else {
        carrinho.push({ produto: produto, quantidade: 1 });
    }
    
    atualizarCarrinho();
    if(!document.getElementById('carrinho-lateral').classList.contains('aberto')){
        toggleCarrinho();
    }
}

function alterarQuantidade(idProduto, delta) {
    const item = carrinho.find(item => item.produto.id === idProduto);
    if (item) {
        item.quantidade += delta;
        if (item.quantidade <= 0) {
            carrinho = carrinho.filter(i => i.produto.id !== idProduto);
        }
    }
    atualizarCarrinho();
}

// 5. CALCULAR A FAIXA DE PREÇOS BASEADO NAS REGRAS DO SEU ATACADO
function obterModalidadeAtual(quantidadeTotal) {
    if (quantidadeTotal >= 50) return { chave: 'at_50', nome: 'Atacado 50+ peças' };
    if (quantidadeTotal >= 20) return { chave: 'at_20', nome: 'Atacado 20+ peças' };
    if (quantidadeTotal >= 10) return { chave: 'at_10', nome: 'Atacado 10+ peças' };
    if (quantidadeTotal >= 3) return { chave: 'at_3', nome: 'Atacado Inicial (3+ peças)' };
    return { chave: 'drop', nome: 'DROP / Varejo (1 a 2 peças)' };
}

function atualizarCarrinho() {
    const qtdTotal = carrinho.reduce((acc, item) => acc + item.quantidade, 0);
    document.getElementById('contador-carrinho').innerText = qtdTotal;

    const modalidade = obterModalidadeAtual(qtdTotal);
    document.getElementById('info-tier').innerHTML = `Modalidade alcançada: <strong>${modalidade.nome}</strong>`;

    const divItens = document.getElementById('carrinho-itens');
    divItens.innerHTML = "";
    let valorTotal = 0;

    carrinho.forEach(item => {
        // Puxa dinamicamente a chave correspondente do seu banco (drop, at_3, at_10...)
        const precoUnitario = item.produto.precosAtacado[modalidade.chave];
        const subtotal = precoUnitario * item.quantidade;
        valorTotal += subtotal;

        divItens.innerHTML += `
            <div class="item-carrinho">
                <div style="text-align: left;">
                    <p style="font-size: 13px; font-weight: bold; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.produto.nome}</p>
                    <p style="font-size: 12px; color: #555;">${item.quantidade}x R$ ${precoUnitario.toFixed(2)}</p>
                </div>
                <div>
                    <button onclick="alterarQuantidade('${item.produto.id}', -1)" style="padding: 2px 6px;">-</button>
                    <button onclick="alterarQuantidade('${item.produto.id}', 1)" style="padding: 2px 6px;">+</button>
                </div>
            </div>
        `;
    });

    document.getElementById('total-carrinho').innerText = valorTotal.toFixed(2);
}

function toggleCarrinho() {
    document.getElementById('carrinho-lateral').classList.toggle('aberto');
}

// 6. ENVIAR PARA O WHATSAPP FORMATADO
function finalizarPedido() {
    if (carrinho.length === 0) {
        alert("Seu carrinho está vazio!");
        return;
    }

    const qtdTotal = carrinho.reduce((acc, item) => acc + item.quantidade, 0);
    const modalidade = obterModalidadeAtual(qtdTotal);
    let totalGeral = 0;

    let mensagem = `*NOVO PEDIDO - NEOPODER.SHOP*%0A`;
    mensagem += `Modalidade: *${modalidade.nome}*%0A%0A`;
    mensagem += `*Itens do Pedido:*%0A`;

    carrinho.forEach(item => {
        const precoUnitario = item.produto.precosAtacado[modalidade.chave];
        const subtotal = precoUnitario * item.quantidade;
        totalGeral += subtotal;

        mensagem += `- ${item.quantidade}x ${item.produto.nome} (R$ ${precoUnitario.toFixed(2)}) = R$ ${subtotal.toFixed(2)}%0A`;
    });

    mensagem += `%0A*TOTAL DO PEDIDO: R$ ${totalGeral.toFixed(2)}*%0A%0A`;
    mensagem += `Aguardo instruções para pagamento e envio das peças.`;

    const linkZap = `https://wa.me/${NUMERO_WHATSAPP}?text=${mensagem}`;
    window.open(linkZap, '_blank');
}

// Inicia o sistema
carregarProdutos();