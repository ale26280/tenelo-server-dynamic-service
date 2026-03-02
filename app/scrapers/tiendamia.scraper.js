/**
 * Scraper para Tienda Mía (Placeholder - Requiere análisis)
 * 
 * NOTA: Tienda Mía puede usar Shopify u otra plataforma.
 * Requiere analizar la estructura específica del sitio.
 * 
 * Por ahora retorna error explicativo
 */

async function getMedia(username, limit = 20) {
    throw new Error('Tienda Mía scraper no implementado aún. Requiere análisis de la plataforma.');
}

async function getInfo(username, limit = 20) {
    throw new Error('Tienda Mía scraper no implementado aún. Requiere análisis de la plataforma.');
}

module.exports = {
    getMedia,
    getInfo
};
