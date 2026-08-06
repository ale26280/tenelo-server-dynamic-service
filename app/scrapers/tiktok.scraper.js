const { execFile } = require('child_process');

/**
 * Scraper para TikTok — lista los videos públicos de un usuario.
 *
 * Motor: yt-dlp. TikTok no tiene API pública para esto y su web exige
 * impersonation de navegador (firma de requests), así que parsear el HTML a
 * mano es frágil y se rompe cada pocas semanas. yt-dlp mantiene ese trabajo.
 *
 * Requisito de infraestructura: el binario yt-dlp tiene que estar en la imagen
 * del servicio (o apuntar YTDLP_BIN a su ruta). Si no está, getMedia/getInfo
 * fallan con un mensaje explícito en vez de un ENOENT críptico.
 *
 * Limitaciones conocidas:
 *  - Devuelve la URL de la página del video, no un mp4 reproducible. El archivo
 *    directo vive en un CDN con URL firmada y de vida corta: para reproducirlo
 *    en un canal hay que descargarlo y servirlo desde el media server propio.
 *  - Solo perfiles públicos.
 */

const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp';
const TIMEOUT_MS = Number(process.env.TIKTOK_SCRAPER_TIMEOUT_MS || 90000);
const CACHE_DURATION_MS = Number(process.env.TIKTOK_SCRAPER_CACHE_MS || 6 * 60 * 60 * 1000); // 6 horas
const MAX_LIMIT = Number(process.env.TIKTOK_SCRAPER_MAX_LIMIT || 50);
const MAX_BUFFER = 32 * 1024 * 1024; // el JSON de un perfil largo supera el default de 1MB

const cache = new Map();

// Una corrida por usuario a la vez: yt-dlp es un proceso pesado y varias
// requests simultáneas del mismo perfil multiplican el riesgo de bloqueo por IP.
const enVuelo = new Map();

/**
 * Acepta 'usuario', '@usuario' o la URL del perfil, y valida el formato real de
 * TikTok (letras, números, punto y guión bajo). Además de evitar consultas
 * inútiles, impide que texto arbitrario termine armando otra URL.
 */
function normalizarUsername(input) {
    if (typeof input !== 'string') {
        throw new Error('El usuario de TikTok es requerido');
    }

    let user = input.trim();

    const match = user.match(/tiktok\.com\/@([^/?#]+)/i);
    if (match) user = match[1];

    user = user.replace(/^@/, '').trim();

    if (!/^[A-Za-z0-9._]{1,24}$/.test(user)) {
        throw new Error(`Usuario de TikTok inválido: "${input}"`);
    }

    return user;
}

function normalizarLimit(limit) {
    const n = parseInt(limit, 10);
    if (!Number.isFinite(n) || n <= 0) return 20;
    return Math.min(n, MAX_LIMIT);
}

function leerCache(key) {
    const cached = cache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.timestamp >= CACHE_DURATION_MS) {
        cache.delete(key);
        return null;
    }
    return cached.data;
}

/**
 * Corre yt-dlp en modo listado (--flat-playlist): trae la metadata de cada video
 * sin resolver los formatos, que es una request extra por video.
 */
function ytdlpListarPerfil(username, limit) {
    const url = `https://www.tiktok.com/@${username}`;
    const args = [
        '--flat-playlist',
        '--dump-single-json',
        '--playlist-end', String(limit),
        '--no-warnings',
        '--ignore-config',
        '--no-update',
        // El contenedor corre con el filesystem read-only: sin esto yt-dlp
        // intenta escribir su caché en el home y falla.
        '--no-cache-dir',
        url
    ];

    return new Promise((resolve, reject) => {
        execFile(YTDLP_BIN, args, { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER }, (error, stdout, stderr) => {
            if (error) {
                if (error.code === 'ENOENT') {
                    return reject(new Error(
                        `No se encontró el binario "${YTDLP_BIN}". Instalá yt-dlp en la imagen del servicio o configurá YTDLP_BIN.`
                    ));
                }
                if (error.killed) {
                    return reject(new Error(`TikTok no respondió en ${TIMEOUT_MS / 1000}s para @${username}`));
                }
                const detalle = (stderr || '').split('\n').find(l => l.startsWith('ERROR:')) || error.message;
                return reject(new Error(`yt-dlp falló para @${username}: ${detalle}`));
            }

            try {
                resolve(JSON.parse(stdout));
            } catch (e) {
                reject(new Error(`No se pudo interpretar la respuesta de yt-dlp para @${username}`));
            }
        });
    });
}

/** Deduplica por usuario las corridas concurrentes del mismo perfil. */
function listarPerfil(username, limit) {
    const key = `${username}_${limit}`;
    if (enVuelo.has(key)) return enVuelo.get(key);

    const promesa = ytdlpListarPerfil(username, limit).finally(() => enVuelo.delete(key));
    enVuelo.set(key, promesa);
    return promesa;
}

/** yt-dlp entrega varias miniaturas; la de mejor preferencia es la última. */
function mejorThumbnail(entry) {
    const thumbs = Array.isArray(entry.thumbnails) ? entry.thumbnails : [];
    const cover = thumbs.find(t => t.id === 'cover');
    if (cover && cover.url) return cover.url;
    return thumbs.length ? thumbs[thumbs.length - 1].url || null : null;
}

function mapearEntry(entry) {
    return {
        type: 'video',
        platform: 'tiktok',
        id: entry.id || null,
        // Página del video, no el archivo: ver limitaciones en el encabezado.
        url: entry.url || (entry.id ? `https://www.tiktok.com/@${entry.uploader}/video/${entry.id}` : null),
        thumbnail: mejorThumbnail(entry),
        duration: entry.duration ?? null,
        title: entry.title || null
    };
}

/**
 * Videos de un usuario, solo lo necesario para mostrarlos.
 * @param {string} username - usuario, @usuario o URL del perfil
 * @param {number} limit - máximo de videos (tope MAX_LIMIT)
 * @returns {Promise<Array>}
 */
async function getMedia(username, limit = 20) {
    const user = normalizarUsername(username);
    const max = normalizarLimit(limit);
    const cacheKey = `media_${user}_${max}`;

    const cached = leerCache(cacheKey);
    if (cached) {
        console.log(`✅ [TikTok] Media servida desde caché para: @${user}`);
        return cached;
    }

    const data = await listarPerfil(user, max);
    const entries = Array.isArray(data && data.entries) ? data.entries : [];
    const media = entries.map(mapearEntry).filter(m => m.url);

    cache.set(cacheKey, { timestamp: Date.now(), data: media });
    console.log(`✅ [TikTok] ${media.length} videos obtenidos para: @${user}`);
    return media;
}

/**
 * Igual que getMedia pero con la metadata completa de cada video.
 * @returns {Promise<Array>}
 */
async function getInfo(username, limit = 20) {
    const user = normalizarUsername(username);
    const max = normalizarLimit(limit);
    const cacheKey = `info_${user}_${max}`;

    const cached = leerCache(cacheKey);
    if (cached) {
        console.log(`✅ [TikTok] Info servida desde caché para: @${user}`);
        return cached;
    }

    const data = await listarPerfil(user, max);
    const entries = Array.isArray(data && data.entries) ? data.entries : [];

    const info = entries.map(entry => ({
        ...mapearEntry(entry),
        description: entry.description || null,
        // yt-dlp devuelve epoch en segundos
        publishedAt: entry.timestamp ? new Date(entry.timestamp * 1000).toISOString() : null,
        author: {
            username: entry.uploader || user,
            name: entry.channel || null,
            url: entry.uploader_url || `https://www.tiktok.com/@${user}`
        },
        stats: {
            views: entry.view_count ?? null,
            likes: entry.like_count ?? null,
            comments: entry.comment_count ?? null,
            shares: entry.repost_count ?? null,
            saves: entry.save_count ?? null
        }
    })).filter(i => i.url);

    cache.set(cacheKey, { timestamp: Date.now(), data: info });
    console.log(`✅ [TikTok] Info de ${info.length} videos obtenida para: @${user}`);
    return info;
}

module.exports = {
    getMedia,
    getInfo
};
