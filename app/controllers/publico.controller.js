'use strict';

/**
 * GET /publico            → catálogo de fuentes públicas (id, url, campos, origen)
 * GET /publico/:fuente    → ARRAY en la raíz con las filas normalizadas
 *
 * La respuesta de una fuente es SÓLO el array: es el contrato que lee el
 * contenido dinámico (`dataSource.type: 'url'`). Lo demás va en cabeceras:
 *   X-Fuente-Actualizado   ISO del último dato bueno
 *   X-Fuente-Antiguo       "1" si la fuente falló y se sirve el último dato
 *   Cache-Control          max-age = lo que le queda al caché
 * Ver `services/fuentesPublicas.js`.
 */
const { FUENTES, catalogo, leer } = require('../services/fuentesPublicas');

function baseDe(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}${req.baseUrl || ''}`;
}

async function getCatalogo(req, res) {
  return res.status(200).json({
    count: Object.keys(FUENTES).length,
    fuentes: catalogo(baseDe(req)),
    contrato: 'Cada fuente devuelve un array en la raíz con objetos planos; los campos titulo/descripcion/precio/extra son los que mapea el contenido dinámico.',
  });
}

async function getFuente(req, res) {
  const { fuente } = req.params;
  if (!FUENTES[fuente]) {
    return res.status(404).json({ error: `Fuente '${fuente}' no existe`, disponibles: Object.keys(FUENTES) });
  }
  try {
    const r = await leer(fuente, req.query || {});
    const ttl = Math.max(5, Math.round(FUENTES[fuente].ttlMs / 1000));
    res.set('Cache-Control', `public, max-age=${Math.min(ttl, 60)}`);
    res.set('X-Fuente-Actualizado', r.actualizado.toISOString());
    if (r.antiguo) res.set('X-Fuente-Antiguo', '1');
    return res.status(200).json(r.filas);
  } catch (e) {
    console.error(`❌ [PUBLICO] ${fuente}:`, e.message);
    return res.status(502).json({ error: `La fuente '${fuente}' no respondió y no hay dato previo`, detalle: e.message });
  }
}

module.exports = { getCatalogo, getFuente };
