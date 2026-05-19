const {join} = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Altera o diretório de cache para o diretório atual do projeto
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};