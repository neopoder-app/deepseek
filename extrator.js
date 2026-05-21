import puppeteer from 'puppeteer';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const BANCO_PATH = path.join(__dirname, 'banco_produtos.json');
const CONFIG_PATH = path.join(__dirname, 'config_atacado.json');

const app = express();
app.use(express.json());

// Forçar a entrega dos ficheiros HTML lendo a pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/painel-admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'painel-admin.html'));
});

// Permite que o HTML aceda ao banco de produtos que está na raiz
app.get('/banco_produtos.json', (req, res) => {
    res.sendFile(BANCO_PATH);
});

// Permitir requisições de páginas locais ou domínios externos (CORS)
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    next();
});

// Inicialização segura dos ficheiros de persistência
if (!fs.existsSync(BANCO_PATH)) fs.writeFileSync(BANCO_PATH, JSON.stringify([], null, 2));
if (!fs.existsSync(CONFIG_PATH)) {
    const configInicial = {
        whatsappAdmin: "5511915184857",
        nomeLoja: "NEOPODER.SHOP",
        urlFornecedor: "https://goatatacadoesportivo.com/",
        lucro: {
            tipo: "por_faixa",
            faixas: [
                { id: "drop", nome: "Drop / Unitário", margemFixa: 31.00 },
                { id: "at_3", nome: "Atacado (3-9 pçs)", margemFixa: 17.00 },
                { id: "at_10", nome: "Atacado (10-19 pçs)", margemFixa: 14.00 },
                { id: "at_20", nome: "Atacado (20-49 pçs)", margemFixa: 12.00 },
                { id: "at_50", nome: "Atacado (50-99 pçs)", margemFixa: 9.00 },
                { id: "at_100", nome: "Atacado (100+ pçs)", margemFixa: 6.00 }
            ]
        }
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(configInicial, null, 2));
}

process.on('unhandledRejection', (reason) => {
    console.error('⚠️ [PREVENÇÃO CRÍTICA] Evitada queda por rejeição assíncrona:', reason);
});

// Função auxiliar para calcular preços ajustados
function calcularPrecosAjustados(custoCof, config) {
    const precos = {};
    if (!config.lucro || !config.lucro.faixas) return precos;
    config.lucro.faixas.forEach(faixa => {
        precos[faixa.id] = parseFloat((custoCof + faixa.margemFixa).toFixed(2));
    });
    return precos;
}

// Sincronização automática com repositório remoto Git
function sincronizarRepositorio() {
    console.log('📦 [GIT] Iniciando sincronização do banco de dados...');
    exec('git add banco_produtos.json config_atacado.json && git commit -m "Mapeamento e Ajustes de Catálogo Automático" && git push origin main', (err) => {
        if (err) {
            console.log('ℹ️ [GIT] Modificações guardadas localmente com sucesso.');
        } else {
            console.log('🚀 [GITHUB] Repositório sincronizado globalmente na nuvem!');
        }
    });
}

// 🤖 CORE DO ROBÔ: Extração Cirúrgica (Sob Demanda com Categoria Forçada)
async function extrairCategoriaEspecifica(urlAlvo, categoriaManual) {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    console.log(`🎯 [ON-DEMAND] Extração na URL: ${urlAlvo} | Categoria: ${categoriaManual}`);
    
    let browser;
    try {
        let banco = JSON.parse(fs.readFileSync(BANCO_PATH, 'utf-8'));
        
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--disable-dev-shm-usage']
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media', 'analytics'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.goto(urlAlvo, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        const rawProdutos = await page.evaluate(() => {
            const extraidos = [];
            const seletoresCartao = document.querySelectorAll('.product-item, .produto, .card, [class*="product"], [class*="produto"], li');
            
            seletoresCartao.forEach(card => {
                const linkEl = card.querySelector('a');
                if (!linkEl) return;

                const nome = card.querySelector('h1, h2, h3, .title, .name, [class*="name"], [class*="titulo"]')?.innerText?.trim();
                let precoRaw = card.querySelector('.price, .preco, [class*="price"], [class*="preco"]')?.innerText?.trim();
                
                if (!precoRaw || !precoRaw.includes('R$')) {
                    const todosFilhos = card.querySelectorAll('*');
                    for (let filho of todosFilhos) {
                        if (filho.children.length === 0 && filho.innerText?.includes('R$')) {
                            precoRaw = filho.innerText.trim();
                            break;
                        }
                    }
                }

                const imgEl = card.querySelector('img');
                let imgUrl = '';
                if (imgEl) {
                    imgUrl = imgEl.getAttribute('data-src') || imgEl.getAttribute('data-lazy-src') || imgEl.getAttribute('data-original') || imgEl.src || '';
                }

                const textoInterno = card.innerText?.toLowerCase() || '';
                const esgotado = textoInterno.includes('esgotado') || textoInterno.includes('sem estoque');

                if (nome && precoRaw && nome.length > 4) {
                    extraidos.push({ nome, precoRaw, imgUrl, esgotado });
                }
            });
            return extraidos;
        });

        let novosAdicionados = 0;
        rawProdutos.forEach(prod => {
            const precoNumerico = parseFloat(prod.precoRaw.replace(/[^\d,.]/g, '').replace('.', '').replace(',', '.'));
            if (isNaN(precoNumerico) || precoNumerico <= 0) return;

            const idUnico = Buffer.from(prod.nome).toString('base64').substring(0, 12);
            const indiceExistente = banco.findIndex(p => p.id === idUnico);

            const precosAtacadoCalculados = calcularPrecosAjustados(precoNumerico, config);

            // Usa a categoria que o utilizador selecionou no painel!
            const categoriaFinal = categoriaManual || "Outros";

            if (indiceExistente === -1) {
                novosAdicionados++;
                banco.push({
                    id: idUnico, nome: prod.nome, img: prod.imgUrl || 'https://via.placeholder.com/400x500?text=Imagem+Sem+Foto',
                    custo: precoNumerico, precosAtacado: precosAtacadoCalculados, categoria: categoriaFinal, esgotado: prod.esgotado, status: "ativo"
                });
            } else {
                banco[indiceExistente].custo = precoNumerico;
                banco[indiceExistente].precosAtacado = precosAtacadoCalculados;
                banco[indiceExistente].esgotado = prod.esgotado;
                banco[indiceExistente].categoria = categoriaFinal; // Atualiza se necessário
            }
        });

        fs.writeFileSync(BANCO_PATH, JSON.stringify(banco, null, 2));
        console.log(`✅ [SUCESSO] ${novosAdicionados} produtos inseridos na categoria: ${categoriaManual}.`);
        sincronizarRepositorio();
        
        return { success: true, adicionados: novosAdicionados };

    } catch (erro) {
        console.error('❌ Erro na extração:', erro);
        return { success: false, error: erro.message };
    } finally {
        if (browser) await browser.close();
    }
}

// 🌐 ROTAS DA API INTERNA (CRUD COMPLETO PARA O ADMIN)
app.get('/api/dados', (req, res) => {
    const produtos = JSON.parse(fs.readFileSync(BANCO_PATH, 'utf-8'));
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    res.json({ produtos, config });
});

app.post('/api/salvar', (req, res) => {
    try {
        const { produtos, config } = req.body;
        if (produtos) fs.writeFileSync(BANCO_PATH, JSON.stringify(produtos, null, 2));
        if (config) fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
        sincronizarRepositorio();
        res.json({ success: true, message: "Dados guardados com sucesso!" });
    } catch (err) {
        res.status(500).json({ error: "Falha ao gravar os ficheiros." });
    }
});

// 🌐 ROTA NOVA: Recebe o link e a categoria escolhida no painel
app.post('/api/extrair-url', async (req, res) => {
    const { url, categoria } = req.body;
    if (!url) return res.status(400).json({ success: false, error: "URL não fornecida" });
    if (!categoria) return res.status(400).json({ success: false, error: "Categoria não selecionada" });
    
    const resultado = await extrairCategoriaEspecifica(url, categoria);
    if (resultado.success) {
        res.json({ success: true, message: `Extração concluída! ${resultado.adicionados} itens adicionados/atualizados em "${categoria}".` });
    } else {
        res.status(500).json({ success: false, error: resultado.error });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`===========================================================`);
    console.log(`⚡ API ENDPOINTS DO CATÁLOGO ATIVOS NA PORTA DE REDE: ${PORT}`);
    console.log(`===========================================================`);
});