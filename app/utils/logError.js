/**
 * logError — el único escritor de errores que hay que usar de acá en adelante.
 *
 * ⚠️ COPIA. El original vive en `tenelo-server-app/app/utils/logError.js`. Los
 * repos son separados y no hay paquete compartido, así que este archivo se
 * duplica tal cual en cada server que registre errores. Si se toca uno, tocar
 * todos: la huella tiene que salir igual en todos o el mismo error aparece
 * partido en dos en el tablero.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Los errores del ecosistema terminaron repartidos en siete colecciones y tres
 * bases del mismo Mongo, porque cada lugar que quiso registrar algo eligió su
 * destino y su forma. Lo que se escribe en la base equivocada es peor que no
 * escribirlo: da sensación de trazabilidad y ocupa disco. server-auth, por
 * ejemplo, escribía en `gbadm` y ningún tablero lo miraba.
 *
 * Este helper fija las tres cosas que hacían falta: DÓNDE (gb.apps_error), CON
 * QUÉ FORMA (origen/error/data + servicio/nivel/huella/fecha) y CON QUÉ
 * IDENTIDAD (la huella, que es lo que permite agrupar y marcar "resuelto").
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CÓMO SE USA
 * ─────────────────────────────────────────────────────────────────────────────
 *   const { logError } = require('../utils/logError')   // ajustar la ruta
 *
 *   try { ... } catch (e) {
 *     await logError({
 *       servicio: 'server-app',              // quién falló
 *       origen: 'postGenera',                // dónde, con precisión de función
 *       error: e,                            // el Error, un string, o un objeto
 *       data: { uuid, modelUrl },            // lo que identifica ESTA ocurrencia
 *     })
 *   }
 *
 * Para algo que NO es una falla (una observación, un aviso), pasar el nivel:
 *
 *     await logError({ servicio: 'server-media', origen: 'optimizacion-innecesaria',
 *                      error: 'Se ofreció optimizar y no hacía falta', nivel: 'info' })
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOS REGLAS QUE HACEN LA DIFERENCIA EN EL TABLERO
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. En `error` va el PROBLEMA; en `data` va la OCURRENCIA. Si el id, la url o
 *    el uuid van dentro del mensaje, cada ocurrencia se convierte en un problema
 *    distinto y el tablero se llena de filas de uno. (Pasó de verdad: 21 hooks
 *    fallidos daban 17 "problemas" porque el id estaba en el mensaje.)
 *
 * 2. `nivel: 'info'` para lo que no es una falla. El tablero se abre filtrando
 *    errores; un cron que avisa que hizo su trabajo no tiene que competir por
 *    esa atención.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NUNCA TIRA
 * ─────────────────────────────────────────────────────────────────────────────
 * Registrar un error no puede provocar otro. Si la escritura falla, se loguea
 * por consola y se sigue: el `await` de un logError jamás debería poder tumbar
 * el flujo que lo llamó.
 *
 * ⚠️ SINCRONÍA. `normalizarMensaje` y `calcularHuella` están duplicadas en
 * `tenelo-server-admin/app/utils/errores.lib.js`, que es el que LEE. Son la
 * misma función a propósito: el lector prefiere la huella guardada y sólo
 * calcula cuando falta, así que si las dos versiones divergen, el mismo error
 * aparece como dos problemas según cuándo se registró. Al tocar una, tocar la
 * otra. Los repos son separados y no hay paquete compartido; es la misma
 * convención que ya se usa con `paquetePricing.js`.
 */

const crypto = require('crypto');
const getDb = require('../../config/db').getDb;

const DB = 'gb';
const COLECCION = 'apps_error';
const NIVELES = ['error', 'warn', 'info'];

function textoDelError(error) {
  if (error === null || error === undefined) return '';
  if (typeof error === 'string') return error;
  if (typeof error !== 'object') return String(error);
  return error.message || error.error || error.msg || error.stack || JSON.stringify(error);
}

/**
 * Template del mensaje: primera línea, sin ids ni números, salvo los de tres
 * dígitos (para no confundir un 500 con un 502). Ver el comentario largo en
 * `errores.lib.js` del server-admin.
 */
function normalizarMensaje(error) {
  let t = textoDelError(error);
  t = String(t).split('\n')[0].trim();
  t = t.replace(/^([A-Za-z]*Error):\s*/, '');

  return t
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '#id')
    .replace(/\b[0-9a-f]{24}\b/gi, '#id')
    .replace(/https?:\/\/\S+/gi, '#url')
    .replace(/(\/[\w.-]+){2,}/g, '#path')
    .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/gi, '#mail')
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '#ip')
    .replace(/\b\d{4,}\b/g, '#')
    .replace(/\b\d{1,2}\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200);
}

function calcularHuella({ servicio, origen, mensaje }) {
  const base = `${servicio || '?'}|${origen || '?'}|${mensaje || ''}`;
  return crypto.createHash('sha1').update(base).digest('hex').substring(0, 12);
}

/**
 * Escribe un error. Devuelve el _id insertado, o null si no se pudo (nunca tira).
 *
 * @param {object}  p
 * @param {string}  p.servicio  quién falló: 'server-app' | 'server-media' | …
 * @param {string}  p.origen    dónde, con precisión de función o de cron
 * @param {any}     p.error     Error, string u objeto
 * @param {any}    [p.data]     lo que identifica esta ocurrencia
 * @param {string} [p.nivel]    'error' (default) | 'warn' | 'info'
 */
async function logError({ servicio, origen, error, data = null, nivel = 'error' }) {
  try {
    const nivelFinal = NIVELES.includes(nivel) ? nivel : 'error';
    const mensaje = normalizarMensaje(error);

    const doc = {
      // Los tres campos históricos, con el mismo nombre y el mismo significado
      // de siempre: el tablero viejo y cualquier consulta hecha a mano siguen
      // funcionando sin cambios.
      origen: origen || '(sin origen)',
      // El error va COMPLETO (con stack si lo trae): el template es para
      // agrupar, no para reemplazar la evidencia.
      error: typeof error === 'object' && error && error.stack ? error.stack : error,
      data,

      // Los campos nuevos.
      servicio: servicio || 'desconocido',
      nivel: nivelFinal,
      huella: calcularHuella({ servicio, origen, mensaje }),
      // Fecha real, además del ObjectId: es la que va a permitir indexar y poner
      // un TTL sobre `expiraEn` más adelante. En la base conviven `created_at` y
      // `createdAt` de escritores viejos; `fecha` es la única que se escribe
      // desde acá.
      fecha: new Date(),
    };

    const r = await getDb().db(DB).collection(COLECCION).insertOne(doc);
    return r.insertedId || null;
  } catch (e) {
    // Registrar un error no puede provocar otro.
    console.error('[logError] no se pudo registrar el error:', e && e.message);
    return null;
  }
}

module.exports = {
  logError,
  normalizarMensaje,
  calcularHuella,
  NIVELES,
};
