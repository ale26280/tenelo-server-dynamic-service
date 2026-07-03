const getDb = require('../../config/db').getDb;
const transporteApi = require('../services/transporteApi.client');

const MODOS_DISPONIBLES = ['colectivos', 'subtes', 'trenes', 'ecobici', 'transito'];

/**
 * GET /transporte
 * Lista los modos disponibles, si la API está configurada y cuándo se
 * actualizaron por última vez (leyendo Mongo, sin llamar a la API externa).
 */
const getModos = async (req, res) => {
  try {
    const db = getDb().db('tenelo');

    const modos = await Promise.all(
      MODOS_DISPONIBLES.map(async (modo) => {
        const doc = await db.collection(`transporte_${modo}`).findOne({ modo });
        return {
          modo,
          configured: transporteApi.isConfigured(),
          lastUpdated: doc ? doc.updatedAt : null,
        };
      }),
    );

    return res.status(200).send({
      count: modos.length,
      modos,
    });
  } catch (error) {
    console.error('❌ Error al listar modos de transporte:', error.message);
    return res.status(500).send({
      error: 'Error al listar modos de transporte',
      details: error.message,
    });
  }
};

/**
 * GET /transporte/:modo
 * Devuelve el último snapshot guardado en Mongo para el modo pedido.
 */
const getModo = async (req, res) => {
  try {
    const { modo } = req.params;

    if (!MODOS_DISPONIBLES.includes(modo)) {
      return res.status(404).send({
        error: `Modo '${modo}' no encontrado`,
        modosDisponibles: MODOS_DISPONIBLES,
      });
    }

    const db = getDb().db('tenelo');
    const doc = await db.collection(`transporte_${modo}`).findOne({ modo });

    if (!doc) {
      return res.status(200).send({
        modo,
        data: null,
        configured: transporteApi.isConfigured(),
        message: transporteApi.isConfigured()
          ? 'Aún sin datos, esperando la primera ejecución del cron'
          : 'Aún sin datos: faltan TRANSPORTE_CLIENT_ID/TRANSPORTE_CLIENT_SECRET',
      });
    }

    return res.status(200).send({
      modo,
      data: doc.raw,
      updatedAt: doc.updatedAt,
    });
  } catch (error) {
    console.error('❌ Error al obtener datos de transporte:', error.message);
    return res.status(500).send({
      error: 'Error al obtener datos de transporte',
      details: error.message,
    });
  }
};

module.exports = {
  getModos,
  getModo,
};
