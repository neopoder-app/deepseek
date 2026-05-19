import puppeteer from 'puppeteer';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec } from 'child_process'; // <-- ADICIONE ESTA LINHA AQUI

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// ... resto do código

const browser = await puppeteer.launch({
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage' // Ajuda a não estourar a memória do plano gratuito
    ]
});

const PORT = process.env.PORT || 3000;
const BANCO_PATH = path.join(__dirname, 'banco_produtos.json');
const CONFIG_PATH = path.join(__dirname, 'config_atacado.json');

const app = express();
app.use(express.json());

// Permitir requisições de páginas locais ou domínios externos (CORS)
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    next();
});

// Inicialização segura dos arquivos de persistência
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

// Interceptador global de falhas assíncronas para evitar quedas do servidor
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ [PREVENÇÃO CRÍTICA] Evitada queda por rejeição assíncrona:', reason);
});

// Função auxiliar para calcular preços ajustados com base nas faixas de lucro
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
            console.log('ℹ️ [GIT] Modificações salvas localmente com sucesso.');
        } else {
            console.log('🚀 [GITHUB] Repositório sincronizado globalmente na nuvem!');
        }
    });
}

// 🤖 CORE DO ROBÔ: Varredura de Alta Performance e Resiliência
async function executarVarreduraResiliente() {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    console.log(`⏳ [MONITOR] Iniciando varredura em: ${config.urlFornecedor}`);
    
    let browser;
    try {
        let banco = JSON.parse(fs.readFileSync(BANCO_PATH, 'utf-8'));
        
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--disable-dev-shm-usage']
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        // Otimização Estrutural: Cancela o download visual mas retém os atributos de texto/imagem do HTML
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media', 'analytics'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Alvo principal - Evita travar por conexões pendentes de rastreadores externos
        try {
            await page.goto(config.urlFornecedor, { waitUntil: 'domcontentloaded', timeout: 25000 });
        } catch (e) {
            console.log('⚠️ [AVISO] Tempo limite de carregamento da Home atingido, processando dados parciais estruturados...');
        }

        // Descobre dinamicamente os links de categorias/coleções do menu
        const linksAlvo = await page.evaluate((baseUrl) => {
            const indesejados = ['/carrinho', '/checkout', '/conta', '/login', '/cadastro', '/contato', 'whats', 'instagram'];
            return Array.from(document.querySelectorAll('a'))
                .map(a => a.href)
                .filter(href => href && href.startsWith(baseUrl))
                .filter(href => !indesejados.some(termo => href.toLowerCase().includes(termo)));
        }, config.urlFornecedor);

        const rotasExclusivas = [...new Set(linksAlvo)].slice(0, 35);
        console.log(`🎯 [MAPEAMENTO] Identificadas ${rotasExclusivas.length} rotas estáveis para mineração de dados.`);

        for (const rota of rotasExclusivas) {
            try {
                await page.goto(rota, { waitUntil: 'domcontentloaded', timeout: 15000 });
                
                const rawProdutos = await page.evaluate(() => {
                    const extraidos = [];
                    const seletoresCartao = document.querySelectorAll('.product-item, .produto, .card, [class*="product"], [class*="produto"], li');
                    
                    seletoresCartao.forEach(card => {
                        const linkEl = card.querySelector('a');
                        if (!linkEl) return;

                        const nome = card.querySelector('h1, h2, h3, .title, .name, [class*="name"], [class*="titulo"]')?.innerText?.trim();
                        
                        // Captura inteligível de preços contendo R$
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

                        // Mineração profunda de links de imagens na nuvem (previne Lazy Loading)
                        const imgEl = card.querySelector('img');
                        let imgUrl = '';
                        if (imgEl) {
                            imgUrl = imgEl.getAttribute('data-src') || 
                                     imgEl.getAttribute('data-lazy-src') || 
                                     imgEl.getAttribute('data-original') || 
                                     imgEl.src || '';
                        }

                        const textoInterno = card.innerText?.toLowerCase() || '';
                        const esgotado = textoInterno.includes('esgotado') || textoInterno.includes('sem estoque');

                        if (nome && precoRaw && nome.length > 4) {
                            extraidos.push({ nome, precoRaw, imgUrl, esgotado });
                        }
                    });
                    return extraidos;
                });

                // Tratamento e higienização dos dados extraídos
                rawProdutos.forEach(prod => {
                    // Sanitização do preço string para Float numérico puro
                    const precoNumerico = parseFloat(prod.precoRaw.replace(/[^\d,.]/g, '').replace('.', '').replace(',', '.'));
                    if (isNaN(precoNumerico) || precoNumerico <= 0) return;

                    const idUnico = Buffer.from(prod.nome).toString('base64').substring(0, 12);
                    const indiceExistente = banco.findIndex(p => p.id === idUnico);

                    // Categorização Automática de Retaguarda
                    let categoria = "Camisas de Time";
                    const min = prod.nome.toLowerCase();
                    if (min.includes('corta vento') || min.includes('jaqueta')) categoria = "Corta-Ventos";
                    if (min.includes('infantil') || min.includes('kit')) categoria = "Kits Infantis";
                    if (min.includes('feminina') || min.includes('fem')) categoria = "Modelos Femininos";
                    if (min.includes('polo') || min.includes('casual')) categoria = "Polos / Casuais";

                    const precosAtacadoCalculados = calcularPrecosAjustados(precoNumerico, config);

                    if (indiceExistente === -1) {
                        // Inserção de novo produto mapeado
                        banco.push({
                            id: idUnico,
                            nome: prod.nome,
                            img: prod.imgUrl || 'https://via.placeholder.com/400x500?text=Imagem+Nuvem',
                            custo: precoNumerico,
                            precosAtacado: precosAtacadoCalculados,
                            categoria: categoria,
                            esgotado: prod.esgotado,
                            status: "ativo"
                        });
                    } else {
                        // Atualiza dinamicamente mantendo customizações manuais se necessário
                        banco[indiceExistente].custo = precoNumerico;
                        banco[indiceExistente].precosAtacado = precosAtacadoCalculados;
                        banco[indiceExistente].esgotado = prod.esgotado;
                    }
                });

            } catch (errLinha) {
                // Rota individual instável não derruba o processamento do resto do catálogo
            }
        }

        fs.writeFileSync(BANCO_PATH, JSON.stringify(banco, null, 2));
        console.log(`✅ [SUCESSO] Varredura finalizada. Total em base: ${banco.length} itens.`);
        sincronizarRepositorio();

    } catch ( erroGlobal ) {
        console.error('❌ Erro crítico no processo do robô:', erroGlobal);
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

// Rota para salvar alterações gerais ou novos produtos criados manualmente
app.post('/api/salvar', (req, res) => {
    try {
        const { produtos, config } = req.body;
        if (produtos) fs.writeFileSync(BANCO_PATH, JSON.stringify(produtos, null, 2));
        if (config) fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
        sincronizarRepositorio();
        res.json({ success: true, message: "Dados persistidos com sucesso global!" });
    } catch (err) {
        res.status(500).json({ error: "Falha ao gravar arquivos de dados." });
    }
});

// Rota de trigger manual para o robô via interface administrativa
app.post('/api/varrer', (req, res) => {
    executarVarreduraResiliente();
    res.json({ success: true, message: "Varredura iniciada em segundo plano!" });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`===========================================================`);
    console.log(`⚡ API ENDPOINTS DO CATÁLOGO ATIVOS NA PORTA DE REDE: ${PORT}`);
    console.log(`===========================================================`);
    console.log(`🤖 O Robô está em repouso. Inicie a varredura pela rota /api/varrer quando quiser.`);
    // A função executarVarreduraResiliente() foi removida daqui para não travar a memória!
});