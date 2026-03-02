/**
 * Scraper para Instagram (Placeholder - Requiere implementación)
 * 
 * NOTA: Instagram requiere:
 * - API oficial de Meta (requiere app review y permisos)
 * - O API de terceros (RapidAPI, ScraperAPI)
 * - O scraping con puppeteer/playwright
 * 
 * Por ahora retorna error explicativo
 */

async function getMedia(username, limit = 20) {
    throw new Error('Instagram scraper no implementado aún. Requiere API oficial o de terceros.');
}

async function getInfo(username, limit = 20) {
    throw new Error('Instagram scraper no implementado aún. Requiere API oficial o de terceros.');
}

module.exports = {
    getMedia,
    getInfo
};
