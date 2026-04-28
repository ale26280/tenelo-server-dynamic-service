const cron = require('node-cron');

/**
 * Cron Job genérico - Template para futuras implementaciones
 *
 * Variables de entorno:
 * - CRON_ENABLED: true/false
 * - CRON_SCHEDULE: expresión cron (default: "0 * * * *" = cada hora)
 */

class GenericCron {
  constructor() {
    this.isEnabled = process.env.CRON_ENABLED === 'true';
    this.schedule = process.env.CRON_SCHEDULE || '0 * * * *';
    this.task = null;
  }

  start() {
    if (!this.isEnabled) {
      console.log('[CRON] Deshabilitado (CRON_ENABLED=false)');
      return;
    }

    if (!cron.validate(this.schedule)) {
      console.error(`[CRON] Expresión inválida: ${this.schedule}`);
      return;
    }

    this.task = cron.schedule(this.schedule, async () => {
      try {
        await this.run();
      } catch (err) {
        console.error('[CRON] Error en ejecución:', err.message);
      }
    }, { timezone: process.env.TZ || 'America/Argentina/Buenos_Aires' });

    console.log(`[CRON] Iniciado con schedule: ${this.schedule}`);
  }

  async run() {
    // TODO: implementar lógica del cron
    console.log('[CRON] Ejecutando...');
  }

  stop() {
    if (this.task) {
      this.task.stop();
      console.log('[CRON] Detenido');
    }
  }
}

module.exports = new GenericCron();
