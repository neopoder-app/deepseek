const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const BANCO_PATH = path.join(__dirname, 'banco_produtos.json');
const CONFIG_PATH = path.join(__dirname, 'config_atacado.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve a interface gráfica

// Garante que os ficheiros existem para evitar erros no servidor
if (!fs.existsSync(BANCO_PATH)) fs.writeFileSync(BANCO_PATH, JSON.stringify([], null, 2));

// Rota Principal da API
app.get('/api/dados', (req, res) => {
    const produtos = JSON.parse(fs.readFileSync(BANCO_PATH, 'utf-8'));
    res.json({ produtos });
});

// Guardar alterações manuais feitas no painel
app.post('/api/salvar', (req, res) => {
    const { produtos } = req.body;
    if (produtos) fs.writeFileSync(BANCO_PATH, JSON.stringify(produtos, null, 2));
    res.json({ success: true });
});

// Acionar o robô a partir do botão no painel
app.post('/api/varrer', (req, res) => {
    res.json({ success: true, message: "Varredura iniciada em background" });
    iniciarExtracaoRobusta(); // Corre em segundo plano
});

// Função do Robô Otimizada para Servidor Cloud Gratuito
async function iniciarExtracaoRobusta() {
    console.log("🤖 [ROBÔ] A iniciar extração no fornecedor...");
    const urlFornecedor = "https://goatatacadoesportivo.com/";
    let browser;
    
    try {
        let banco = JSON.parse(fs.readFileSync(BANCO_PATH, 'utf-8'));
        let novosAdicionados = 0;

        // Configuração de baixo consumo de RAM para a Render
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });

        const page = await browser.newPage();
        
        // Bloqueia imagens grandes e CSS para não causar Timeout
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.goto(urlFornecedor, { waitUntil: 'domcontentloaded', timeout: 35000 });

        const itensMapeados = await page.evaluate(() => {
            const extraidos = [];
            // Seletores que cobrem a maioria das plataformas de e-commerce e Irroba
            const cards = document.querySelectorAll('.product-item, .produto, .card, li[class*="product"]');
            
            cards.forEach(card => {
                const nome = card.querySelector('h1, h2, h3, .title, .name, [class*="name"]')?.innerText?.trim();
                
                let precoRaw = card.querySelector('.price, .preco, [class*="price"]')?.innerText?.trim();
                if (!precoRaw && card.innerText.includes('R$')) {
                    precoRaw = card.innerText.match(/R\$\s*\d+,\d{2}/)?.[0] || "";
                }

                const imgEl = card.querySelector('img');
                const img = imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('data-original') || imgEl.src || '') : '';

                if (nome && precoRaw && nome.length > 5) {
                    extraidos.push({ nome, precoRaw, img });
                }
            });
            return extraidos;
        });

        itensMapeados.forEach(prod => {
            const precoNumerico = parseFloat(prod.precoRaw.replace(/[^\d,.]/g, '').replace('.', '').replace(',', '.'));
            if (isNaN(precoNumerico) || precoNumerico <= 0) return;

            const idUnico = Buffer.from(prod.nome).toString('base64').substring(0, 10);
            
            // Classificação automática básica
            let cat = "Camisas de Time";
            const nm = prod.nome.toLowerCase();
            if(nm.includes('corta vento')) cat = "Corta-Ventos";
            else if(nm.includes('infantil') || nm.includes('kit')) cat = "Kits Infantis";
            else if(nm.includes('feminina')) cat = "Modelos Femininos";

            const idx = banco.findIndex(p => p.id === idUnico);
            if (idx === -1) {
                banco.push({
                    id: idUnico,
                    nome: prod.nome,
                    img: prod.img || 'https://via.placeholder.com/400x500?text=Sem+Foto',
                    custo: precoNumerico,
                    categoria: cat,
                    status: 'pendente' // Fica pendente para acionar o alerta no painel
                });
                novosAdicionados++;
            } else {
                banco[idx].custo = precoNumerico; // Atualiza preço se já existir
            }
        });

        fs.writeFileSync(BANCO_PATH, JSON.stringify(banco, null, 2));
        console.log(`✅ [ROBÔ] Fim da extração. ${novosAdicionados} produtos novos guardados.`);

    } catch (err) {
        console.error("⚠️ Erro no processo do robô:", err.message);
    } finally {
        if (browser) await browser.close();
    }
}

app.listen(PORT, () => {
    console.log(`🚀 Servidor NEOPODER ativo na porta ${PORT}`);
    // Comente a linha abaixo:
    // iniciarExtracaoRobusta(); 
});