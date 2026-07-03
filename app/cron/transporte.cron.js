const cron = require('node-cron');
const getDb = require('../../config/db').getDb;
const transporteApi = require('../services/transporteApi.client');

/**
 * Cron de API Transporte Público (GCBA)
 *
 * Pull-ea periódicamente cada modo habilitado y lo persiste en Mongo
 * (colección `transporte_<modo>`). Los endpoints de este servicio leen
 * de Mongo, no llaman a la API externa en cada request.
 *
 * Variables de entorno:
 * - TRANSPORTE_CRON_ENABLED: true/false (default false)
 * - TRANSPORTE_CRON_SCHEDULE: expresión cron con segundos (default: cada 30s)
 * - TRANSPORTE_MODOS_ENABLED: csv de modos a pullear (default: los 5 modos)
 */

const FETCHERS = {
  colectivos: transporteApi.getColectivosPositions,
  subtes: transporteApi.getSubtesForecast,
  trenes: transporteApi.getTrenesPositions,
  ecobici: transporteApi.getEcobiciStations,
  transito: transporteApi.getTransitoEventos,
};

class TransporteCron {
  constructor() {
    this.isEnabled = process.env.TRANSPORTE_CRON_ENABLED === 'true';
    this.schedule = process.env.TRANSPORTE_CRON_SCHEDULE || '*/30 * * * * *';
    this.modos = (process.env.TRANSPORTE_MODOS_ENABLED || Object.keys(FETCHERS).join(','))
      .split(',')
      .map((m) => m.trim())
      .filter((m) => FETCHERS[m]);
    this.task = null;
  }

  start() {
    if (!this.isEnabled) {
      console.log('[CRON transporte] Deshabilitado (TRANSPORTE_CRON_ENABLED=false)');
      return;
    }

    if (!cron.validate(this.schedule)) {
      console.error(`[CRON transporte] Expresión inválida: ${this.schedule}`);
      return;
    }

    this.task = cron.schedule(this.schedule, async () => {
      await this.run();
    }, { timezone: process.env.TZ || 'America/Argentina/Buenos_Aires' });

    console.log(`[CRON transporte] Iniciado con schedule: ${this.schedule} - modos: ${this.modos.join(', ')}`);
  }

  async run() {
    if (!transporteApi.isConfigured()) {
      console.warn('[CRON transporte] No configurado (faltan TRANSPORTE_CLIENT_ID/TRANSPORTE_CLIENT_SECRET), saltando ejecución');
      return;
    }

    const db = getDb().db('tenelo');

    for (const modo of this.modos) {
      try {
        const data = await FETCHERS[modo]();

        await db.collection(`transporte_${modo}`).replaceOne(
          { modo },
          { modo, raw: data, updatedAt: new Date() },
          { upsert: true },
        );

        console.log(`[CRON transporte] '${modo}' actualizado correctamente`);
      } catch (err) {
        console.error(`[CRON transporte] Error en '${modo}':`, err.message);
      }
    }
  }

  stop() {
    if (this.task) {
      this.task.stop();
      console.log('[CRON transporte] Detenido');
    }
  }
}

module.exports = new TransporteCron();
