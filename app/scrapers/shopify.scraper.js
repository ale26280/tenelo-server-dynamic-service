const axios = require('axios');

/**
 * Scraper para tiendas Shopify
 * Usa el endpoint público /products.json que la mayoría de tiendas Shopify exponen
 * Ejemplo: https://tienda.myshopify.com/products.json
 */

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 horas
const cache = new Map();

/**
 * Obtiene solo las imágenes de los productos de una tienda Shopify
 * @param {string} shopDomain - Dominio de la tienda (ej: mitienda.com o mitienda.myshopify.com)
 * @param {number} limit - Cantidad máxima de items (default: 20)
 * @returns {Promise<Array>} Array de objetos con media
 */
async function getMedia(shopDomain, limit = 20) {
    try {
        const cacheKey = `media_${shopDomain}_${limit}`;
        
        // Verificar caché
        if (cache.has(cacheKey)) {
            const cached = cache.get(cacheKey);
            if (Date.now() - cached.timestamp < CACHE_DURATION_MS) {
                console.log(`✅ [Shopify] Media servida desde caché para: ${shopDomain}`);
                return cached.data;
            }
        }

        // Normalizar dominio
        const domain = normalizeDomain(shopDomain);
        const url = `https://${domain}/products.json?limit=${limit}`;
        
        const response = await axios.get(url, { 
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; TeneloBot/1.0)'
            }
        });
        
        if (!response.data.products || response.data.products.length === 0) {
            return [];
        }

        // Extraer solo las imágenes
        const media = [];
        response.data.products.forEach(product => {
            if (product.images && product.images.length > 0) {
                product.images.forEach(img => {
                    media.push({
                        type: 'image',
                        url: img.src,
                        productId: product.id
                    });
                });
            }
        });

        // Limitar resultados
        const limitedMedia = media.slice(0, limit);

        // Guardar en caché
        cache.set(cacheKey, {
            timestamp: Date.now(),
            data: limitedMedia
        });

        console.log(`✅ [Shopify] ${limitedMedia.length} imágenes obtenidas de: ${shopDomain}`);
        return limitedMedia;

    } catch (error) {
        console.error(`❌ [Shopify] Error obteniendo media:`, error.message);
        throw new Error(`No se pudo obtener media de Shopify: ${error.message}`);
    }
}

/**
 * Obtiene información completa de los productos de una tienda Shopify
 * @param {string} shopDomain - Dominio de la tienda
 * @param {number} limit - Cantidad máxima de items (default: 20)
 * @returns {Promise<Array>} Array de objetos con info completa
 */
async function getInfo(shopDomain, limit = 20) {
    try {
        const cacheKey = `info_${shopDomain}_${limit}`;
        
        // Verificar caché
        if (cache.has(cacheKey)) {
            const cached = cache.get(cacheKey);
            if (Date.now() - cached.timestamp < CACHE_DURATION_MS) {
                console.log(`✅ [Shopify] Info servida desde caché para: ${shopDomain}`);
                return cached.data;
            }
        }

        // Normalizar dominio
        const domain = normalizeDomain(shopDomain);
        const url = `https://${domain}/products.json?limit=${limit}`;
        
        const response = await axios.get(url, { 
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; TeneloBot/1.0)'
            }
        });
        
        if (!response.data.products || response.data.products.length === 0) {
            return [];
        }

        // Mapear la info completa
        const products = response.data.products.map(product => {
            const firstVariant = product.variants && product.variants[0];
            const images = product.images ? product.images.map(img => img.src) : [];
            
            return {
                id: product.id,
                title: product.title,
                price: firstVariant ? firstVariant.price : null,
                currency: 'ARS', // Shopify no siempre expone currency en JSON público
                images: images,
                description: product.body_html ? stripHtml(product.body_html) : product.title,
                vendor: product.vendor,
                productType: product.product_type,
                url: `https://${domain}/products/${product.handle}`
            };
        });

        // Guardar en caché
        cache.set(cacheKey, {
            timestamp: Date.now(),
            data: products
        });

        console.log(`✅ [Shopify] ${products.length} productos obtenidos de: ${shopDomain}`);
        return products;

    } catch (error) {
        console.error(`❌ [Shopify] Error obteniendo info:`, error.message);
        throw new Error(`No se pudo obtener info de Shopify: ${error.message}`);
    }
}

/**
 * Normaliza el dominio de la tienda
 */
function normalizeDomain(domain) {
    // Remover protocolo si existe
    domain = domain.replace(/^https?:\/\//, '');
    // Remover trailing slash
    domain = domain.replace(/\/$/, '');
    return domain;
}

/**
 * Remueve tags HTML básicos
 */
function stripHtml(html) {
    if (!html) return '';
    return html
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .trim()
        .substring(0, 200); // Limitar a 200 caracteres
}

module.exports = {
    getMedia,
    getInfo
};
