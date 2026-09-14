/**
 * Emisor de pruebas — un "sistema del cliente" simulado que ENVÍA datos a un
 * webhook de tenelo.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   POST /ds/v1/emisor            programa N envíos cada M segundos
 *   GET  /ds/v1/emisor/:id        cómo va (cuántos salieron, qué respondió cada uno)
 *
 * ── POR QUÉ EXISTE ────────────────────────────────────────────────────────
 * Un webhook se prueba desde AFUERA o no se prueba. Ingerir el modelo desde
 * server-app mismo no ejercita el camino que va a usar el cliente: el POST
 * público, el token de escritura, el procesado, y la pantalla cambiando. Este
 * emisor hace exactamente lo que haría el sistema de un cliente —un POST con
 * bearer cada tanto— desde otro proceso.
 *
 * El turnero es la fuente natural: es función del reloj, así que cada envío
 * trae la ventana que corresponde y en pantalla se ve el turno avanzar.
 * `filasDeTurnero` es la MISMA función del GET /turnero: la fuente que se lee
 * y la que se envía no pueden divergir.
 *
 * ── QUÉ NO ES ─────────────────────────────────────────────────────────────
 * No es un servicio. Vive en memoria: si el proceso reinicia, la emisión
 * muere y el panel lo ve como "sin novedades". Es una prueba de a lo sumo
 * unos minutos, y persistirla sería inventarle una cola a algo que no la
 * necesita.
 *
 * ── SEGURIDAD ─────────────────────────────────────────────────────────────
 * · Requiere sesión (`ensureAuth`): lo pide server-app reenviando la sesión
 *   del usuario que apretó "Enviar datos de prueba".
 * · Sólo envía a hosts de `EMISOR_DESTINOS` (csv; default los dominios de
 *   tenelo). Un endpoint que hace POST a una URL que le pasan es un SSRF
 *   servido en bandeja si no se acota el destino.
 * · Tope de emisiones simultáneas, de envíos por emisión y de intervalo.
 * · El token de escritura del webhook pasa por acá y NO se loguea ni se
 *   devuelve en el estado.
 */
'use strict';

const crypto = require('crypto');
const axios = require('axios');
const { filasDeTurnero, parametrosDeTurnero } = require('./turnero.controller');
const fs = require('fs');
const path = require('path');

const VECES_MAX = 30;
const CADA_MIN = 5;
const CADA_MAX = 60;
const EMISIONES_MAX = 20;
/** Cuánto se recuerda una emisión terminada, para que el panel la consulte. */
const RETENCION_MS = 15 * 60 * 1000;
const TIMEOUT_ENVIO_MS = 8000;

const DESTINOS_POR_DEFECTO = ['tenelo.app', 'tenelo.net', 'tenelo.com.ar'];

const destinosPermitidos = () =>
  String(process.env.EMISOR_DESTINOS || DESTINOS_POR_DEFECTO.join(','))
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

/** El host del destino tiene que ser uno permitido o un subdominio de uno. */
function destinoPermitido(url) {
  let u;
  try {
    u = new URL(url);
  } catch (_) {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const host = u.hostname.toLowerCase();
  return destinosPermitidos().some((p) => host === p || host.endsWith(`.${p}`));
}

/** emisionId → estado. */
const emisiones = new Map();

function limpiarViejas() {
  const ahora = Date.now();
  for (const [id, e] of emisiones) {
    if (e.terminadoEn && ahora - e.terminadoEn > RETENCION_MS) emisiones.delete(id);
  }
}

/**
 * Una URL que el emisor puede LEER para reenviar. Pública y http(s): el
 * emisor corre adentro de la red de tenelo, y una URL interna lo convertiría
 * en un puente hacia servicios que no tienen que verse desde afuera.
 */
function urlLegible(url) {
  let u;
  try { u = new URL(url); } catch (_) { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return false;
  if (/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return false;
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return false;
  return true;
}

/**
 * Las filas de un envío según la fuente. El turnero no es especial: es la
 * fuente que cambia sola y por eso sirve para VER el refresco, pero cualquier
 * lista sirve para probar la forma.
 *
 *   turnero              función del reloj, cambia cada `params.cada` s
 *   servicio:<tipo>      un JSON de ejemplo de servicios-json/ (estático)
 *   url:<https://...>    lo que devuelva esa URL en el momento del envío — la
 *                        API del propio cliente, por ejemplo, para reproducir
 *                        "mi sistema manda lo que hoy expone" sin tocar nada
 */
async function filasDe(fuente, params) {
  if (fuente === 'turnero') {
    const p = parametrosDeTurnero(params);
    const ventana = Math.floor(Date.now() / (p.cada * 1000));
    return filasDeTurnero(ventana, p);
  }
  const m = /^servicio:([a-z0-9_-]+)$/i.exec(fuente || '');
  if (m) {
    const archivo = path.join(__dirname, '../servicios-json', `${m[1].toLowerCase()}.json`);
    if (!fs.existsSync(archivo)) throw new Error(`No existe el servicio de ejemplo "${m[1]}"`);
    const json = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    // Los JSON de ejemplo pueden venir envueltos; el webhook los desenvuelve
    // igual, pero acá se manda la lista si se la encuentra, para que la
    // prueba sea la forma "buena".
    if (Array.isArray(json)) return json;
    const lista = Object.values(json).find((v) => Array.isArray(v) && v.length && typeof v[0] === 'object');
    return lista || json;
  }
  const u = /^url:(.+)$/i.exec(fuente || '');
  if (u) {
    const url = u[1].trim();
    if (!urlLegible(url)) throw new Error(`La fuente url: tiene que ser una URL pública http(s), no "${url}"`);
    const r = await axios.get(url, { timeout: TIMEOUT_ENVIO_MS, headers: { Accept: 'application/json' }, validateStatus: () => true, maxContentLength: 2 * 1024 * 1024 });
    if (r.status >= 300) throw new Error(`La fuente ${url} respondió ${r.status}`);
    if (typeof r.data !== 'object' || r.data === null) throw new Error(`La fuente ${url} no devolvió JSON`);
    return r.data;
  }
  throw new Error(`Fuente desconocida "${fuente}". Válidas: turnero, servicio:<tipo>, url:<https://...>`);
}

async function enviarUno(e) {
  const n = e.enviados + 1;
  const inicio = Date.now();
  let registro;
  try {
    const filas = await filasDe(e.fuente, e.params);
    const r = await axios.post(e.destino, filas, {
      headers: {
        Authorization: `Bearer ${e.token}`,
        'Content-Type': 'application/json',
        'X-Webhook-Origen': 'prueba',
      },
      timeout: TIMEOUT_ENVIO_MS,
      validateStatus: () => true,
    });
    registro = {
      n,
      en: new Date(inicio).toISOString(),
      ms: Date.now() - inicio,
      status: r.status,
      filas: Array.isArray(filas) ? filas.length : null,
      respuesta: r.data && typeof r.data === 'object'
        ? { ok: r.data.ok, filas: r.data.filas, motivo: r.data.motivo, avisos: r.data.avisos }
        : null,
    };
  } catch (err) {
    registro = { n, en: new Date(inicio).toISOString(), ms: Date.now() - inicio, status: null, error: err.message };
  }
  e.enviados = n;
  e.respuestas.push(registro);
  console.log(`📤 Emisor ${e.id}: envío ${n}/${e.veces} → ${registro.status ?? 'error'} (${registro.ms} ms)`);
}

function programar(e) {
  const paso = async () => {
    if (e.cancelada) return terminar(e);
    await enviarUno(e);
    if (e.enviados >= e.veces || e.cancelada) return terminar(e);
    e.proximoEnvio = new Date(Date.now() + e.cada * 1000).toISOString();
    e.timer = setTimeout(paso, e.cada * 1000);
    return null;
  };
  // El primero sale enseguida: quien apretó el botón quiere ver algo ya.
  e.proximoEnvio = new Date().toISOString();
  e.timer = setTimeout(paso, 0);
}

function terminar(e) {
  e.terminado = true;
  e.terminadoEn = Date.now();
  e.proximoEnvio = null;
  if (e.timer) clearTimeout(e.timer);
  e.timer = null;
}

/** Lo que se devuelve: nunca el token. */
function vista(e) {
  return {
    emisionId: e.id,
    fuente: e.fuente,
    destino: e.destino,
    veces: e.veces,
    cada: e.cada,
    enviados: e.enviados,
    proximoEnvio: e.proximoEnvio,
    terminado: e.terminado,
    cancelada: e.cancelada,
    respuestas: e.respuestas,
    creadoEn: new Date(e.creadoEn).toISOString(),
  };
}

/** POST /emisor */
const iniciar = async (req, res) => {
  try {
    limpiarViejas();
    const b = req.body || {};

    if (!b.destino || !destinoPermitido(b.destino)) {
      return res.status(400).json({ ok: false, motivo: `El destino tiene que ser una URL de ${destinosPermitidos().join(', ')}` });
    }
    if (!b.token || typeof b.token !== 'string' || b.token.length < 16) {
      return res.status(400).json({ ok: false, motivo: 'Falta el token de escritura del webhook' });
    }
    const fuente = String(b.fuente || 'turnero').slice(0, 2048);
    try {
      // Se lee una vez ANTES de programar nada: una fuente que no sirve se
      // rechaza acá, con motivo, y no en el tercer envío.
      await filasDe(fuente, b.params || {});
    } catch (e) {
      return res.status(400).json({ ok: false, motivo: e.message });
    }
    const veces = Math.min(VECES_MAX, Math.max(1, Math.trunc(Number(b.veces)) || 1));
    const cada = Math.min(CADA_MAX, Math.max(CADA_MIN, Math.trunc(Number(b.cada)) || 10));

    const activas = [...emisiones.values()].filter((e) => !e.terminado).length;
    if (activas >= EMISIONES_MAX) {
      return res.status(429).json({ ok: false, motivo: `Hay ${activas} emisiones en curso; esperá a que terminen.` });
    }

    const e = {
      id: crypto.randomBytes(12).toString('hex'),
      destino: b.destino,
      token: b.token,
      fuente,
      params: b.params && typeof b.params === 'object' ? { ...b.params, cada: b.params.cada || cada } : { cada },
      veces,
      cada,
      enviados: 0,
      respuestas: [],
      terminado: false,
      cancelada: false,
      proximoEnvio: null,
      creadoEn: Date.now(),
      terminadoEn: null,
      timer: null,
    };
    emisiones.set(e.id, e);
    programar(e);
    return res.status(202).json({ ok: true, ...vista(e) });
  } catch (error) {
    console.error('❌ Error iniciando emisión:', error.message);
    return res.status(500).json({ ok: false, motivo: 'Error iniciando la emisión' });
  }
};

/** GET /emisor/:id */
const estado = async (req, res) => {
  const e = emisiones.get(String(req.params.id || ''));
  if (!e) return res.status(404).json({ ok: false, motivo: 'No hay una emisión con ese id (o ya se olvidó)' });
  return res.status(200).json({ ok: true, ...vista(e) });
};

/** DELETE /emisor/:id — corta lo que falte. */
const cancelar = async (req, res) => {
  const e = emisiones.get(String(req.params.id || ''));
  if (!e) return res.status(404).json({ ok: false, motivo: 'No hay una emisión con ese id' });
  if (!e.terminado) {
    e.cancelada = true;
    terminar(e);
  }
  return res.status(200).json({ ok: true, ...vista(e) });
};

module.exports = { iniciar, estado, cancelar, destinoPermitido, urlLegible, filasDe };
