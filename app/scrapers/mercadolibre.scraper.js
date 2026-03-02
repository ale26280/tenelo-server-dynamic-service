const axios = require('axios');

/**
 * Scraper para Mercado Libre
 * Usa la API pública oficial de Mercado Libre
 * Docs: https://developers.mercadolibre.com.ar/es_ar/api-docs-es
 */

const BASE_URL = 'https://api.mercadolibre.com';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 horas
const cache = new Map();

/**
 * Obtiene solo las imágenes de los productos de un vendedor
 * @param {string} sellerId - ID del vendedor en Mercado Libre
 * @param {number} limit - Cantidad máxima de items (default: 20)
 * @returns {Promise<Array>} Array de objetos con media
 */
async function getMedia(sellerId, limit = 20) {
    try {
        const cacheKey = `media_${sellerId}_${limit}`;
        
        // Verificar caché
        if (cache.has(cacheKey)) {
            const cached = cache.get(cacheKey);
            if (Date.now() - cached.timestamp < CACHE_DURATION_MS) {
                console.log(`✅ [ML] Media servida desde caché para seller: ${sellerId}`);
                return cached.data;
            }
        }

        // Buscar items del vendedor
        const searchUrl = `${BASE_URL}/sites/MLA/search?seller_id=${sellerId}&limit=${limit}`;
        const searchResponse = await axios.get(searchUrl, { timeout: 10000 });
        
        if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
            return [];
        }

        // Extraer solo las imágenes
        const media = searchResponse.data.results.map(item => ({
            type: 'image',
            url: item.thumbnail ? item.thumbnail.replace('http://', 'https://') : null,
            productId: item.id
        })).filter(m => m.url);

        // Guardar en caché
        cache.set(cacheKey, {
            timestamp: Date.now(),
            data: media
        });

        console.log(`✅ [ML] ${media.length} imágenes obtenidas para seller: ${sellerId}`);
        return media;

    } catch (error) {
        console.error(`❌ [ML] Error obteniendo media:`, error.message);
        throw new Error(`No se pudo obtener media de Mercado Libre: ${error.message}`);
    }
}

/**
 * Obtiene información completa de los productos de un vendedor
 * @param {string} sellerId - ID del vendedor en Mercado Libre
 * @param {number} limit - Cantidad máxima de items (default: 20)
 * @returns {Promise<Array>} Array de objetos con info completa
 */
async function getInfo(sellerId, limit = 20) {
    try {
        const cacheKey = `info_${sellerId}_${limit}`;
        
        // Verificar caché
        if (cache.has(cacheKey)) {
            const cached = cache.get(cacheKey);
            if (Date.now() - cached.timestamp < CACHE_DURATION_MS) {
                console.log(`✅ [ML] Info servida desde caché para seller: ${sellerId}`);
                return cached.data;
            }
        }

        // Buscar items del vendedor
        const searchUrl = `${BASE_URL}/sites/MLA/search?seller_id=${sellerId}&limit=${limit}`;
        const searchResponse = await axios.get(searchUrl, { timeout: 10000 });
        
        if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
            return [];
        }

        // Mapear la info completa
        const products = searchResponse.data.results.map(item => ({
            id: item.id,
            title: item.title,
            price: item.price,
            currency: item.currency_id,
            images: [item.thumbnail ? item.thumbnail.replace('http://', 'https://') : null].filter(Boolean),
            description: item.title, // La búsqueda no trae descripción completa
            condition: item.condition, // new, used
            availableQuantity: item.available_quantity,
            url: item.permalink
        }));

        // Guardar en caché
        cache.set(cacheKey, {
            timestamp: Date.now(),
            data: products
        });

        console.log(`✅ [ML] ${products.length} productos obtenidos para seller: ${sellerId}`);
        return products;

    } catch (error) {
        console.error(`❌ [ML] Error obteniendo info:`, error.message);
        throw new Error(`No se pudo obtener info de Mercado Libre: ${error.message}`);
    }
}

module.exports = {
    getMedia,
    getInfo
};
