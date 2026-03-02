/**
 * Controlador de Scraper - Feature BETA
 * 
 * Provee dos endpoints para obtener información de plataformas externas:
 * 1. /scraper/media - Solo contenido multimedia (imágenes/videos)
 * 2. /scraper/info - Información completa (título, precio, descripción, etc)
 * 
 * Arquitectura modular: cada plataforma tiene su propio scraper en /app/scrapers/
 * Fácil de extender y customizar.
 */

// Importar scrapers individuales (arquitectura desacoplada)
const mercadolibreScraper = require('../scrapers/mercadolibre.scraper');
const shopifyScraper = require('../scrapers/shopify.scraper');
const tiktokScraper = require('../scrapers/tiktok.scraper');
const instagramScraper = require('../scrapers/instagram.scraper');
const tiendamiaScraper = require('../scrapers/tiendamia.scraper');

// Mapa de plataformas disponibles
const SCRAPERS = {
    'mercadolibre': mercadolibreScraper,
    'shopify': shopifyScraper,
    'tiktok': tiktokScraper,
    'instagram': instagramScraper,
    'tiendamia': tiendamiaScraper
};

/**
 * GET /scraper/platforms
 * Lista las plataformas disponibles y su estado
 */
const getPlatforms = async (req, res) => {
    try {
        const platforms = Object.keys(SCRAPERS).map(key => ({
            platform: key,
            endpoints: {
                media: `/ds/v1/scraper/media`,
                info: `/ds/v1/scraper/info`
            },
            status: ['mercadolibre', 'shopify'].includes(key) ? 'active' : 'pending'
        }));

        return res.status(200).send({
            message: 'Feature BETA - Scrapers modulares',
            count: platforms.length,
            platforms: platforms,
            usage: {
                media: 'POST /scraper/media con body: { platform, username, limit }',
                info: 'POST /scraper/info con body: { platform, username, limit }'
            }
        });

    } catch (error) {
        console.error('❌ Error listando plataformas:', error.message);
        return res.status(500).send({ 
            error: 'Error al listar plataformas',
            details: error.message 
        });
    }
};

/**
 * POST /scraper/media
 * Obtiene solo contenido multimedia (imágenes/videos)
 * 
 * Body:
 * {
 *   "platform": "mercadolibre|shopify|tiktok|instagram|tiendamia",
 *   "username": "usuario_o_seller_id",
 *   "limit": 20
 * }
 */
const getMedia = async (req, res) => {
    try {
        const { platform, username, limit = 20 } = req.body;

        // Validaciones
        if (!platform || !username) {
            return res.status(400).send({
                error: 'Parámetros requeridos: platform y username',
                example: {
                    platform: 'mercadolibre',
                    username: 'SELLER_ID',
                    limit: 20
                },
                platformsDisponibles: Object.keys(SCRAPERS)
            });
        }

        // Verificar que la plataforma existe
        const scraper = SCRAPERS[platform.toLowerCase()];
        if (!scraper) {
            return res.status(400).send({
                error: `Plataforma '${platform}' no soportada`,
                platformsDisponibles: Object.keys(SCRAPERS)
            });
        }

        console.log(`🔍 [Scraper] Obteniendo media de ${platform} para: ${username}`);

        // Ejecutar scraper específico
        const media = await scraper.getMedia(username, parseInt(limit));

        return res.status(200).send({
            platform: platform,
            username: username,
            count: media.length,
            media: media
        });

    } catch (error) {
        console.error('❌ [Scraper] Error obteniendo media:', error.message);
        return res.status(500).send({
            error: 'Error al obtener media',
            details: error.message
        });
    }
};

/**
 * POST /scraper/info
 * Obtiene información completa (título, precio, descripción, imágenes, etc)
 * 
 * Body:
 * {
 *   "platform": "mercadolibre|shopify|tiktok|instagram|tiendamia",
 *   "username": "usuario_o_seller_id",
 *   "limit": 20
 * }
 */
const getInfo = async (req, res) => {
    try {
        const { platform, username, limit = 20 } = req.body;

        // Validaciones
        if (!platform || !username) {
            return res.status(400).send({
                error: 'Parámetros requeridos: platform y username',
                example: {
                    platform: 'shopify',
                    username: 'mitienda.myshopify.com',
                    limit: 20
                },
                platformsDisponibles: Object.keys(SCRAPERS)
            });
        }

        // Verificar que la plataforma existe
        const scraper = SCRAPERS[platform.toLowerCase()];
        if (!scraper) {
            return res.status(400).send({
                error: `Plataforma '${platform}' no soportada`,
                platformsDisponibles: Object.keys(SCRAPERS)
            });
        }

        console.log(`🔍 [Scraper] Obteniendo info de ${platform} para: ${username}`);

        // Ejecutar scraper específico
        const info = await scraper.getInfo(username, parseInt(limit));

        return res.status(200).send({
            platform: platform,
            username: username,
            count: info.length,
            data: info
        });

    } catch (error) {
        console.error('❌ [Scraper] Error obteniendo info:', error.message);
        return res.status(500).send({
            error: 'Error al obtener información',
            details: error.message
        });
    }
};

module.exports = {
    getPlatforms,
    getMedia,
    getInfo
};
