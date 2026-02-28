const cron = require('node-cron');
const axios = require('axios');

/**
 * Cron Job interno para procesamiento de facturas pendientes
 * 
 * Configuración mediante variables de entorno:
 * - FACTURACION_CRON_ENABLED: true/false (activa/desactiva el cron)
 * - FACTURACION_CRON_SCHEDULE: expresión cron (default: "0 *2 * * *" = cada 2 horas)
 * - API_URL: URL base de la API
 */

class FacturacionCron {
  constructor() {
    this.isEnabled = process.env.FACTURACION_CRON_ENABLED === 'true';
    this.schedule = process.env.FACTURACION_CRON_SCHEDULE || '0 */2 * * *'; // Cada 2 horas por defecto
    this.apiUrl = process.env.API_URL || 'http://localhost:6010/api/v1';
    this.task = null;
    this.isRunning = false;
    this.lastRun = null;
    this.lastResult = null;
    this.runCount = 0;
  }

  /**
   * Inicia el cron job
   */
  start() {
    if (!this.isEnabled) {
      console.log('[FACTURACION CRON] ⏸️  Cron deshabilitado (FACTURACION_CRON_ENABLED=false)');
      return;
    }

    if (this.task) {
      console.log('[FACTURACION CRON] ⚠️  Cron ya está iniciado');
      return;
    }

    console.log(`[FACTURACION CRON] 🚀 Iniciando procesamiento automático de facturas`);
    console.log(`[FACTURACION CRON] 📅 Schedule: ${this.schedule}`);
    console.log(`[FACTURACION CRON] 🔗 API URL: ${this.apiUrl}/facturas/procesar`);

    // Validar expresión cron
    if (!cron.validate(this.schedule)) {
      console.error(`[FACTURACION CRON] ❌ Expresión cron inválida: ${this.schedule}`);
      return;
    }

    // Crear tarea programada
    this.task = cron.schedule(this.schedule, async () => {
      await this.procesarFacturas();
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'America/Argentina/Buenos_Aires'
    });

    console.log('[FACTURACION CRON] ✅ Cron job iniciado correctamente');
  }

  /**
   * Detiene el cron job
   */
  stop() {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('[FACTURACION CRON] 🛑 Cron job detenido');
    }
  }

  /**
   * Procesa las facturas pendientes
   */
  async procesarFacturas() {
    if (this.isRunning) {
      console.log('[FACTURACION CRON] ⏳ Ya hay un procesamiento en curso, saltando...');
      return;
    }

    const startTime = Date.now();
    this.isRunning = true;
    this.lastRun = new Date();
    this.runCount++;

    console.log(`[FACTURACION CRON] ▶️  Iniciando procesamiento #${this.runCount} - ${this.lastRun.toISOString()}`);

    try {
      const response = await axios.post(`${this.apiUrl}/facturas/procesar`, {}, {
        timeout: 300000, // 5 minutos timeout
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const duration = Date.now() - startTime;
      const result = response.data;

      this.lastResult = {
        success: true,
        timestamp: this.lastRun,
        duration: duration,
        data: result.data
      };

      console.log(`[FACTURACION CRON] ✅ Procesamiento completado en ${duration}ms`);
      console.log(`[FACTURACION CRON] 📊 Resultado:`, {
        procesadas: result.data?.procesadas || 0,
        exitosas: result.data?.exitosas || 0,
        fallidas: result.data?.fallidas || 0
      });

    } catch (error) {
      const duration = Date.now() - startTime;

      this.lastResult = {
        success: false,
        timestamp: this.lastRun,
        duration: duration,
        error: error.message
      };

      console.error(`[FACTURACION CRON] ❌ Error en procesamiento (${duration}ms)`);

      if (error.response) {
        console.error(`[FACTURACION CRON] HTTP ${error.response.status}:`, error.response.data);
      } else if (error.request) {
        console.error('[FACTURACION CRON] No se recibió respuesta del servidor');
      } else {
        console.error('[FACTURACION CRON] Error:', error.message);
      }
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Ejecuta el procesamiento manualmente (fuera del schedule)
   */
  async runNow() {
    console.log('[FACTURACION CRON] 🔄 Ejecución manual solicitada');
    await this.procesarFacturas();
  }

  /**
   * Obtiene el estado del cron
   */
  getStatus() {
    return {
      enabled: this.isEnabled,
      schedule: this.schedule,
      running: this.isRunning,
      taskActive: this.task !== null,
      lastRun: this.lastRun,
      lastResult: this.lastResult,
      runCount: this.runCount,
      apiUrl: this.apiUrl
    };
  }
}

// Exportar instancia única (singleton)
const facturacionCron = new FacturacionCron();

module.exports = facturacionCron;
