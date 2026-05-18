const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3000;
const BANCO_PATH = path.join(__dirname, 'banco_produtos.json');
const CONFIG_PATH = path.join(__dirname, 'config_atacado.json');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

if (!fs.existsSync(BANCO_PATH)) fs.writeFileSync(BANCO_PATH, JSON.stringify([], null, 2));

const delay = ms => new Promise(res => setTimeout(res, ms));

function sincronizarRepositorioGitHub(totalNovos) {
    console.log('📦 [GIT] Sincronizando catálogo completo com o GitHub...');
    exec('git add . && git commit -m "Atualização Automática - Catálogo" && git push origin main', (err) => {
        if (err) {
            console.log('⚠️ [GIT] Repositório já estava atualizado ou sem alterações pendentes.');
            return;
        }
        console.log('🚀 [LIVE] VITRINE DA LOJA ATUALIZADA GLOBALMENTE NO GITHUB!');
        
        if (totalNovos > 0) {
            let config = {};
            if (fs.existsSync(CONFIG_PATH)) config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
            const numeroWhats = config.whatsappAdmin || "5511915184857"; // Fallback seguro
            
            const mensagem = `🔥 *NEOPODER.SHOP*\n\n🤖 Varredura COMPLETA finalizada!\n🎯 *${totalNovos} novos produtos* aguardando aprovação.`;
            const urlWhats = `https://web.whatsapp.com/send?phone=${numeroWhats}&text=${encodeURIComponent(mensagem)}`;
            
            console.log('📢 [ALERTA] Abrindo o WhatsApp Web...');
            exec(`start "" "${urlWhats}"`);
        }
    });
}

async function varrerCatalogoCompleto() {
    console.log('⏳ [ROBÔ] Iniciando Varredura Avançada de Catálogo Completo...');
    let browser;
    try {
        if (!fs.existsSync(CONFIG_PATH)) {
            console.error('❌ Erro: Arquivo config_atacado.json não encontrado na raiz!');
            return;
        }
        
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        let bancoExistente = JSON.parse(fs.readFileSync(BANCO_PATH, 'utf-8'));
        let novosAdicionados = 0;

        // 🔥 BLINDAGEM CONTRA O ERRO: Injeção automática da URL se ela não existir no JSON
        const urlFornecedorSegura = config.urlFornecedor || "https://goatatacadoesportivo.com/";

        browser = await puppeteer.launch({ 
            headless: "new", 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        let urlBaseCatalog = urlFornecedorSegura.replace(/\/$/, '') + '/produtos';
        let linksProdutosCompletos = [];
        let paginaAtual = 1;
        let continuarBuscando = true;

        console.log('🔍 [FASE 1] Coletando links de todas as páginas...');

        while (continuarBuscando) {
            let urlPagina = `${urlBaseCatalog}/page/${paginaAtual}/`;
            console.log(`📑 Lendo página ${paginaAtual}...`);
            
            try {
                const response = await page.goto(urlPagina, { waitUntil: 'networkidle2', timeout: 45000 });
                if (response.status() === 404) break;

                const linksDaPagina = await page.evaluate(() => {
                    return Array.from(document.querySelectorAll('a'))
                        .map(a => a.href)
                        .filter(href => href.includes('/produtos/') || href.includes('/produto/'))
                        .filter(href => !href.includes('/page/'));
                });

                if (!linksDaPagina || linksDaPagina.length === 0) break;

                linksProdutosCompletos.push(...linksDaPagina);
                paginaAtual++;
                if (paginaAtual > 40) break; 
                await delay(1000);
            } catch (errPage) {
                continuarBuscando = false;
            }
        }

        const linksUnicos = [...new Set(linksProdutosCompletos)];
        console.log(`🎯 [FASE 1 CONCLUÍDA] Total: ${linksUnicos.length} produtos localizados!`);

        console.log('🚀 [FASE 2] Extração detalhada de preços e estoques...');
        let contador = 1;
        for (const link of linksUnicos) {
            console.log(`[${contador}/${linksUnicos.length}] Lendo dados...`);
            contador++;

            try {
                await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 35000 });
                
                const payload = await page.evaluate(() => {
                    const nome = document.querySelector('h1, .product-name, .js-product-name')?.innerText?.trim();
                    const precoRaw = document.querySelector('.js-price-display, .product-price, #price_display, .js-compare-price-display')?.innerText;
                    const imgEl = document.querySelector('.js-product-slide-img, .product-image img, .js-cloudzoom-image, .js-product-thumb-img');
                    let img = imgEl ? (imgEl.src || imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : '';
                    
                    const btnTexto = document.querySelector('input[type="submit"], .js-prod-submit-form, .js-addtocart-button')?.value?.toLowerCase() || document.querySelector('.js-prod-submit-form')?.innerText?.toLowerCase() || '';
                    const esgotado = btnTexto.includes('sem') || btnTexto.includes('esgotado') || btnTexto.includes('indisponível');

                    let categoria = "Camisas de Time";
                    if (nome?.toLowerCase().includes('corta vento') || nome?.toLowerCase().includes('windbreaker')) categoria = "Corta-Ventos";
                    if (nome?.toLowerCase().includes('infantil') || nome?.toLowerCase().includes('kit')) categoria = "Kits Infantis";
                    if (nome?.toLowerCase().includes('feminina') || nome?.toLowerCase().includes('refe')) categoria = "Modelos Femininos";

                    return { nome, precoRaw, img, esgotado, categoria };
                });

                if (!payload.nome || !payload.precoRaw) continue;

                const precoCusto = parseFloat(payload.precoRaw.replace(/[^\d,.]/g, '').replace('.', '').replace(',', '.'));
                if (isNaN(precoCusto) || precoCusto <= 0) continue;

                const hashId = Buffer.from(payload.nome).toString('base64').substring(0, 10);
                const jaExiste = bancoExistente.some(p => p.id === hashId);

                if (!jaExiste) {
                    bancoExistente.push({
                        id: hashId, nome: payload.nome, img: payload.img || 'https://via.placeholder.com/400x500?text=Sem+Foto',
                        custo: precoCusto, categoria: payload.categoria, esgotado: payload.esgotado,
                        tamanhos: ["P", "M", "G", "GG"], status: "pendente"
                    });
                    novosAdicionados++;
                } else {
                    const idx = bancoExistente.findIndex(p => p.id === hashId);
                    bancoExistente[idx].custo = precoCusto;
                    bancoExistente[idx].esgotado = payload.esgotado;
                }
                await delay(300);
            } catch (errorNoLink) {}
        }

        fs.writeFileSync(BANCO_PATH, JSON.stringify(bancoExistente, null, 2));
        console.log(`💾 ${novosAdicionados} novos itens retidos para aprovação.`);
        sincronizarRepositorioGitHub(novosAdicionados);

    } catch (err) {
        console.error('❌ Erro Crítico:', err);
    } finally {
        if (browser) await browser.close();
    }
}

app.get('/api/dados', (req, res) => {
    if (!fs.existsSync(BANCO_PATH)) return res.json({ produtos: [], config: {} });
    const produtos = JSON.parse(fs.readFileSync(BANCO_PATH, 'utf-8'));
    const config = fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) : {};
    res.json({ produtos, config });
});

app.post('/api/ajuste-manual', (req, res) => {
    const { id, novoPreco, status } = req.body;
    let produtos = JSON.parse(fs.readFileSync(BANCO_PATH, 'utf-8'));
    const idx = produtos.findIndex(p => p.id === id);
    if (idx !== -1) {
        if (novoPreco) produtos[idx].custo = parseFloat(novoPreco);
        if (status) produtos[idx].status = status; 
        fs.writeFileSync(BANCO_PATH, JSON.stringify(produtos, null, 2));
        sincronizarRepositorioGitHub(0);
        return res.json({ success: true });
    }
    res.status(404).json({ error: "Produto não localizado." });
});

app.listen(PORT, () => {
    console.log(`🔥 SISTEMA BLINDADO ATIVO NA PORTA ${PORT}`);
    varrerCatalogoCompleto();
});