/**
 * Scraper para TikTok (Placeholder - Requiere implementación)
 * 
 * NOTA: TikTok requiere:
 * - API de terceros (RapidAPI, ScraperAPI)
 * - O scraping con puppeteer/playwright
 * 
 * Por ahora retorna error explicativo
 */

async function getMedia(username, limit = 20) {
    throw new Error('TikTok scraper no implementado aún. Requiere API de terceros o scraping avanzado.');
}

async function getInfo(username, limit = 20) {
    throw new Error('TikTok scraper no implementado aún. Requiere API de terceros o scraping avanzado.');
}

module.exports = {
    getMedia,
    getInfo
};
