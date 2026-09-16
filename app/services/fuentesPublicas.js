'use strict';

/**
 * FUENTES PÚBLICAS DE TENELO — datos abiertos normalizados como filas planas.
 *
 * ── Qué es ─────────────────────────────────────────────────────────────────
 * Cada fuente es un adaptador que lee un dato público de terceros (una
 * cotización, el estado del subte) y lo devuelve como lo único que el mapeo de
 * contenido dinámico sabe leer: un ARRAY en la raíz con objetos planos, con los
 * campos que el panel y el creator ya conocen (`titulo`, `descripcion`,
 * `precio`, `extra`, `extra1`…). Así una plantilla de la Central de Recursos
 * puede apuntar a `https://tenelo.app/ds/v1/publico/<fuente>` y funcionar para
 * cualquier cuenta que la importe, sin configurar nada.
 *
 * ── Por qué acá y no la URL cruda en la plantilla ──────────────────────────
 * Las fuentes externas envejecen: cambian el formato, agregan campos, se caen.
 * Si la plantilla apuntara a dolarapi.com, cada pantalla que la importó se
 * rompe a la vez y se arregla de a una. Con el adaptador en el medio se arregla
 * en un lugar; además se cachea (una pantalla que relee cada 60 s no puede ir
 * a la fuente cada 60 s multiplicado por N pantallas) y ante una caída se
 * sirve el último dato bueno con su antigüedad declarada, en vez de vacío.
 *
 * ── Contrato de cada adaptador ─────────────────────────────────────────────
 *   { id, nombre, descripcion, ttlMs, periodicidadSugeridaSegundos, campos,
 *     origen: { nombre, url, terminos }, traer(): Promise<Fila[]> }
 * `traer` devuelve las filas ya normalizadas; el caché y el "stale-if-error"
 * los pone `leer()`, común a todas.
 *
 * Sin credenciales de tenelo hacia afuera: todo sale por `httpExterno`.
 */

const axios = require('../utils/httpExterno');
const transporteApi = require('./transporteApi.client');

// ── Caché en memoria, por fuente ─────────────────────────────────────────────
// Suficiente para un proceso; con dos réplicas hay dos cachés, y eso está
// bien: son lecturas idempotentes de datos públicos.
const cache = new Map(); // id → { filas, actualizado: Date, vence: number }
const enCurso = new Map(); // id → Promise (anti-stampede)

function pesos(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '';
  return '$' + Math.round(Number(n)).toLocaleString('es-AR');
}

function horaLocal(iso, timeZone = 'America/Argentina/Buenos_Aires') {
  try {
    return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(new Date(iso));
  } catch (e) {
    return '';
  }
}

// ── Dólar ────────────────────────────────────────────────────────────────────
// dolarapi.com: público, sin clave, JSON plano. Una fila por cotización.
const ORDEN_DOLAR = ['oficial', 'blue', 'tarjeta', 'bolsa', 'contadoconliqui', 'mayorista', 'cripto'];
const NOMBRE_DOLAR = {
  oficial: 'Dólar oficial',
  blue: 'Dólar blue',
  tarjeta: 'Dólar tarjeta',
  bolsa: 'Dólar MEP',
  contadoconliqui: 'Contado con liqui',
  mayorista: 'Dólar mayorista',
  cripto: 'Dólar cripto',
};

const dolar = {
  id: 'dolar',
  nombre: 'Cotizaciones del dólar',
  descripcion: 'Oficial, blue, tarjeta, MEP, contado con liqui, mayorista y cripto. Precio = venta; descripción = compra.',
  ttlMs: 5 * 60 * 1000,
  periodicidadSugeridaSegundos: 300,
  campos: ['titulo', 'descripcion', 'precio', 'extra', 'compra', 'venta', 'actualizado'],
  origen: { nombre: 'DolarApi', url: 'https://dolarapi.com', terminos: 'API pública y gratuita, sin clave' },
  async traer() {
    const { data } = await axios.get('https://dolarapi.com/v1/dolares', { timeout: 10000 });
    if (!Array.isArray(data) || !data.length) throw new Error('dolarapi no devolvió cotizaciones');
    const porCasa = new Map(data.map((d) => [d.casa, d]));
    const filas = [];
    for (const casa of ORDEN_DOLAR) {
      const d = porCasa.get(casa);
      if (!d) continue;
      filas.push({
        titulo: NOMBRE_DOLAR[casa] || d.nombre || casa,
        descripcion: d.compra !== null && d.compra !== undefined ? `Compra ${pesos(d.compra)}` : 'Sólo venta',
        precio: pesos(d.venta),
        extra: `Actualizado ${horaLocal(d.fechaActualizacion)}`,
        compra: d.compra ?? null,
        venta: d.venta ?? null,
        casa,
        actualizado: d.fechaActualizacion || null,
      });
    }
    return filas;
  },
};

// ── Subte ────────────────────────────────────────────────────────────────────
// API Transporte del GCBA (oficial, con credenciales de tenelo). Estado por
// línea a partir de `serviceAlerts` (GTFS-realtime); las líneas sin alerta
// están normales. El pronóstico de arribos NO se usa: para una pantalla lo que
// se lee es "¿la línea anda?", no la posición de cada formación.
const LINEAS_SUBTE = [
  { id: 'LineaA', titulo: 'Línea A', descripcion: 'Plaza de Mayo – San Pedrito', color: '#18A4E0' },
  { id: 'LineaB', titulo: 'Línea B', descripcion: 'L. N. Alem – J. M. de Rosas', color: '#EB1C24' },
  { id: 'LineaC', titulo: 'Línea C', descripcion: 'Retiro – Constitución', color: '#233E99' },
  { id: 'LineaD', titulo: 'Línea D', descripcion: 'Catedral – Congreso de Tucumán', color: '#00954C' },
  { id: 'LineaE', titulo: 'Línea E', descripcion: 'Retiro – Plaza de los Virreyes', color: '#6E2C91' },
  { id: 'LineaH', titulo: 'Línea H', descripcion: 'Facultad de Derecho – Hospitales', color: '#FFD100' },
  // El id del Premetro en las alertas no se pudo verificar (no tuvo alertas el
  // 16/9): se aceptan las tres formas que usa el GTFS de la ciudad.
  { id: 'PM1', ids: ['PM1', 'PM2', 'Premetro'], titulo: 'Premetro', descripcion: 'Intendente Saguier – Centro Cívico / Gral. Savio', color: '#F58220' },
];

// `effect` del GTFS-realtime → cómo lo lee una persona en la pantalla.
const EFECTO_SUBTE = {
  1: 'Sin servicio',
  2: 'Servicio limitado',
  3: 'Demoras',
  4: 'Desvío',
  5: 'Servicio adicional',
  6: 'Servicio modificado',
  7: 'Novedad',
  8: 'Novedad',
  9: 'Parada movida',
  10: 'Normal',
  11: 'Accesibilidad',
};

function textoAlerta(alerta) {
  const t = alerta?.header_text?.translation || alerta?.description_text?.translation || [];
  const es = t.find((x) => x.language === 'es') || t[0];
  return (es && es.text ? String(es.text) : '').trim();
}

const subte = {
  id: 'subte',
  nombre: 'Estado del subte de Buenos Aires',
  descripcion: 'Una fila por línea (A–H y Premetro) con su estado: Normal, Demoras, Servicio limitado, Sin servicio o Novedad, y el detalle oficial.',
  ttlMs: 60 * 1000,
  periodicidadSugeridaSegundos: 60,
  campos: ['titulo', 'descripcion', 'extra', 'detalle', 'estado', 'color', 'normal'],
  origen: { nombre: 'API Transporte, Gobierno de la Ciudad de Buenos Aires', url: 'https://apitransporte.buenosaires.gob.ar', terminos: 'Datos abiertos, con credenciales de tenelo' },
  async traer() {
    if (!transporteApi.isConfigured()) throw new Error('API Transporte sin credenciales (TRANSPORTE_CLIENT_ID/SECRET)');
    const data = await transporteApi.getSubtesServiceAlerts();
    const entidades = Array.isArray(data?.entity) ? data.entity : [];
    const porLinea = new Map();
    for (const e of entidades) {
      const alerta = e?.alert;
      if (!alerta || e.is_deleted) continue;
      const rutas = (alerta.informed_entity || []).map((i) => i.route_id).filter(Boolean);
      for (const ruta of rutas) {
        const prev = porLinea.get(ruta) || [];
        prev.push(alerta);
        porLinea.set(ruta, prev);
      }
    }
    return LINEAS_SUBTE.map((l) => {
      const alertas = (l.ids || [l.id]).flatMap((id) => porLinea.get(id) || []);
      // La más grave manda: sin servicio > limitado > demoras > el resto.
      const peso = (a) => ({ 1: 5, 2: 4, 3: 3, 6: 2, 4: 2 }[a.effect] || 1);
      const principal = alertas.slice().sort((a, b) => peso(b) - peso(a))[0];
      const estado = principal ? (EFECTO_SUBTE[principal.effect] || 'Novedad') : 'Normal';
      const detalle = principal ? textoAlerta(principal) : '';
      return {
        titulo: l.titulo,
        descripcion: l.descripcion,
        extra: estado,
        detalle,
        estado,
        color: l.color,
        normal: !principal,
        alertas: alertas.length,
      };
    });
  },
};

// ── Fútbol ───────────────────────────────────────────────────────────────────
// API-Football (api-sports.io). Tabla de posiciones de una liga. Clave y
// temporada por entorno: el plan Free (100 req/día) NO da la temporada en
// curso (verificado 16/9/2026: "try from 2022 to 2024"), así que sin plan Pro
// esto es una demo con datos reales de 2024. TTL 1 h → ≤ 24 pedidos/día por
// réplica, lejos del cupo. Sin clave, la fuente no existe en el catálogo.
const FUTBOL_LIGA = Number(process.env.APIFOOTBALL_LEAGUE || 128); // Liga Profesional Argentina
const FUTBOL_TEMPORADA = Number(process.env.APIFOOTBALL_SEASON || 2024);

const futbol = {
  id: 'futbol',
  nombre: 'Tabla de posiciones — Liga Profesional Argentina',
  descripcion: `Una fila por equipo: posición, puntos, partidos jugados, diferencia de gol, racha y escudo (media). Temporada ${FUTBOL_TEMPORADA}.`,
  ttlMs: 60 * 60 * 1000,
  periodicidadSugeridaSegundos: 3600,
  campos: ['titulo', 'descripcion', 'precio', 'extra', 'media', 'posicion', 'puntos', 'jugados', 'ganados', 'empatados', 'perdidos', 'diferencia', 'racha'],
  origen: { nombre: 'API-Football', url: 'https://www.api-football.com', terminos: 'Plan Free: 100 req/día, sin temporada en curso; Pro para la actual' },
  disponible: () => !!process.env.APIFOOTBALL_KEY,
  async traer() {
    if (!process.env.APIFOOTBALL_KEY) throw new Error('Fútbol sin clave (APIFOOTBALL_KEY)');
    const { data } = await axios.get('https://v3.football.api-sports.io/standings', {
      params: { league: FUTBOL_LIGA, season: FUTBOL_TEMPORADA },
      headers: { 'x-apisports-key': process.env.APIFOOTBALL_KEY },
      timeout: 10000,
    });
    const errores = data && data.errors && !Array.isArray(data.errors) ? Object.values(data.errors) : [];
    if (errores.length) throw new Error(`API-Football: ${errores.join(' · ')}`);
    const grupos = data?.response?.[0]?.league?.standings || [];
    const tabla = grupos.flat();
    if (!tabla.length) throw new Error('API-Football no devolvió la tabla');
    return tabla.map((t) => ({
      titulo: `${t.rank}. ${t.team?.name || ''}`,
      descripcion: `${t.all?.played ?? 0} PJ · ${t.all?.win ?? 0} G · ${t.all?.draw ?? 0} E · ${t.all?.lose ?? 0} P · DG ${t.goalsDiff > 0 ? '+' : ''}${t.goalsDiff ?? 0}`,
      precio: `${t.points ?? 0} pts`,
      // W/D/L del proveedor → G/E/P, que es como se lee acá.
      extra: t.form ? `Últimos: ${String(t.form).replace(/W/g, 'G').replace(/D/g, 'E').replace(/L/g, 'P').split('').join(' ')}` : '',
      media: t.team?.logo || '',
      posicion: t.rank,
      puntos: t.points,
      jugados: t.all?.played,
      ganados: t.all?.win,
      empatados: t.all?.draw,
      perdidos: t.all?.lose,
      diferencia: t.goalsDiff,
      racha: t.form || '',
      grupo: t.group || '',
    }));
  },
};

// Sólo entran al catálogo las fuentes que tienen lo que necesitan (clave).
const TODAS = { dolar, subte, futbol };
const FUENTES = Object.fromEntries(
  Object.entries(TODAS).filter(([, f]) => typeof f.disponible !== 'function' || f.disponible()),
);

/** Catálogo, para el panel y la documentación. */
function catalogo(base) {
  return Object.values(FUENTES).map((f) => ({
    id: f.id,
    nombre: f.nombre,
    descripcion: f.descripcion,
    url: `${base}/publico/${f.id}`,
    campos: f.campos,
    periodicidadSugeridaSegundos: f.periodicidadSugeridaSegundos,
    origen: f.origen,
  }));
}

/**
 * Filas de una fuente, con caché y último-dato-bueno.
 * Devuelve { filas, actualizado, desdeCache, antiguo, error }.
 */
async function leer(id) {
  const f = FUENTES[id];
  if (!f) return null;
  const ahora = Date.now();
  const c = cache.get(id);
  if (c && c.vence > ahora) return { filas: c.filas, actualizado: c.actualizado, desdeCache: true, antiguo: false, error: null };

  if (!enCurso.has(id)) {
    enCurso.set(id, (async () => {
      try {
        const filas = await f.traer();
        const actualizado = new Date();
        cache.set(id, { filas, actualizado, vence: Date.now() + f.ttlMs });
        return { filas, actualizado, desdeCache: false, antiguo: false, error: null };
      } catch (e) {
        // Último dato bueno, declarado como antiguo. Sin dato previo, el error
        // sube: mejor un 502 que una lista vacía que parece "no hay novedades".
        if (c) return { filas: c.filas, actualizado: c.actualizado, desdeCache: true, antiguo: true, error: e.message };
        throw e;
      } finally {
        enCurso.delete(id);
      }
    })());
  }
  return enCurso.get(id);
}

module.exports = { FUENTES, catalogo, leer };
