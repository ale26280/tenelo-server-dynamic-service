const cron = require('node-cron');
const getDb = require('../../config/db').getDb;
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const ObjectId = require('mongodb').ObjectId;

// Importar controlador de SSE para revocar visualizadores
const sseController = require('../controllers/structure/ssevisualizador.controller');

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Cron Job interno para expiración automática de planes
 * 
 * Configuración mediante variables de entorno:
 * - PLANES_CRON_ENABLED: true/false (activa/desactiva el cron)
 * - PLANES_CRON_SCHEDULE: expresión cron (default: "0 0 * * *" = diario a medianoche)
 * 
 * Responsabilidades:
 * - Detectar planes activos cuya fecha_expiracion ya pasó
 * - Cambiar status de 'active' a 'expired'
 * - Registrar cambios en historial
 */

class PlanesCron {
  constructor() {
    this.isEnabled = process.env.PLANES_CRON_ENABLED === 'true';
    this.schedule = process.env.PLANES_CRON_SCHEDULE || '0 0 * * *'; // Diario a medianoche por defecto
    this.timezone = process.env.TZ || 'America/Argentina/Buenos_Aires';
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
      console.log('[PLANES CRON] ⏸️  Cron deshabilitado (PLANES_CRON_ENABLED=false)');
      return;
    }

    if (this.task) {
      console.log('[PLANES CRON] ⚠️  Cron ya está iniciado');
      return;
    }

    console.log(`[PLANES CRON] 🚀 Iniciando verificación automática de planes expirados`);
    console.log(`[PLANES CRON] 📅 Schedule: ${this.schedule}`);
    console.log(`[PLANES CRON] 🌍 Timezone: ${this.timezone}`);

    // Validar expresión cron
    if (!cron.validate(this.schedule)) {
      console.error(`[PLANES CRON] ❌ Expresión cron inválida: ${this.schedule}`);
      return;
    }

    // Crear tarea programada
    this.task = cron.schedule(this.schedule, async () => {
      await this.verificarPlanesExpirados();
    }, {
      scheduled: true,
      timezone: this.timezone
    });

    console.log('[PLANES CRON] ✅ Cron job iniciado correctamente');
  }

  /**
   * Detiene el cron job
   */
  stop() {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('[PLANES CRON] 🛑 Cron job detenido');
    }
  }

  /**
   * Desactiva canales y revoca visualizadores del usuario cuando expira su plan
   * @param {string} uuid - UUID del usuario
   */
  async desactivarCanalesYVisualizadores(uuid) {
    const resultado = {
      canalesDesactivados: 0,
      visualizadoresRevocados: 0,
      errores: []
    };

    try {
      const dbTenelo = getDb().db('tenelo');

      // 1. Buscar todos los canales activos del usuario
      const canales = await dbTenelo.collection('apps_canales').find({
        uuid: String(uuid),
        status: 'active'
      }).toArray();

      console.log(`[PLANES CRON] 🔍 Usuario ${uuid}: encontrados ${canales.length} canales activos`);

      if (canales.length === 0) {
        return resultado;
      }

      // 2. Desactivar todos los canales del usuario
      const canalesUpdate = await dbTenelo.collection('apps_canales').updateMany(
        {
          uuid: String(uuid),
          status: 'active'
        },
        {
          $set: {
            status: 'inactive',
            inactivated_at: new Date(),
            inactivated_reason: 'plan_expired'
          }
        }
      );

      resultado.canalesDesactivados = canalesUpdate.modifiedCount;
      console.log(`[PLANES CRON] ✅ Desactivados ${resultado.canalesDesactivados} canales`);

      // 3. Para cada canal, buscar y revocar sus visualizadores
      for (const canal of canales) {
        try {
          const canalId = String(canal._id);

          // Buscar todos los visualizadores del canal
          const visualizadores = await dbTenelo.collection('apps_canales_visualizadores').find({
            idCanal: canal._id,
            status: { $ne: 'revoked' },
            removed: { $ne: true }
          }).toArray();

          console.log(`[PLANES CRON] 🔍 Canal ${canal.name || canalId}: ${visualizadores.length} visualizadores activos`);

          // Revocar cada visualizador
          for (const vis of visualizadores) {
            try {
              const visId = String(vis._id);

              // Primero: cerrar conexiones activas, enviar evento revoke SSE y limpiar Redis
              // removeVisualizer() envía el evento __revoke__ via SSE, cierra streams y limpia Redis
              await sseController.removeVisualizer(visId, canalId);

              // TODO: Evaluar si es necesaria la actualización en BD después de testing
              // removeVisualizer() ya maneja:
              //   - Cierre de streams SSE con evento __revoke__
              //   - Limpieza de memoria (canales map, tmpConnections, userKeyToDbId)
              //   - Limpieza de Redis (zrem de presence sets)
              //   - Publicación de evento de invalidación a otras instancias
              //
              // Actualizar status en BD solo sería necesario para:
              //   - Prevenir reconexiones del visualizador
              //   - Mostrar status correcto en panel de admin
              //   - Validaciones que lean status desde BD (ej: validatePairing)
              //   - Auditoría/trazabilidad histórica
              //
              // TESTING: Probar sin actualizar BD. Si el visualizador intenta reconectarse
              // cuando no debería, o si hay problemas en el panel de admin, descomentar.
              
              /*
              await dbTenelo.collection('apps_canales_visualizadores').updateOne(
                { _id: vis._id },
                {
                  $set: {
                    status: 'revoked',
                    consent: false,
                    revokedAt: new Date(),
                    revokedReason: 'plan_expired'
                  }
                }
              );
              */

              resultado.visualizadoresRevocados++;
              console.log(`[PLANES CRON] 🚫 Visualizador revocado: ${visId}`);

            } catch (visError) {
              const errorMsg = `Error revocando visualizador ${vis._id}: ${visError.message}`;
              console.error(`[PLANES CRON] ❌ ${errorMsg}`);
              resultado.errores.push(errorMsg);
            }
          }

        } catch (canalError) {
          const errorMsg = `Error procesando canal ${canal._id}: ${canalError.message}`;
          console.error(`[PLANES CRON] ❌ ${errorMsg}`);
          resultado.errores.push(errorMsg);
        }
      }

      console.log(`[PLANES CRON] 📊 Resumen usuario ${uuid}:`);
      console.log(`   - Canales desactivados: ${resultado.canalesDesactivados}`);
      console.log(`   - Visualizadores revocados: ${resultado.visualizadoresRevocados}`);
      if (resultado.errores.length > 0) {
        console.log(`   - Errores: ${resultado.errores.length}`);
      }

    } catch (error) {
      const errorMsg = `Error general desactivando canales y visualizadores para ${uuid}: ${error.message}`;
      console.error(`[PLANES CRON] ❌ ${errorMsg}`);
      resultado.errores.push(errorMsg);
    }

    return resultado;
  }

  /**
   * Verifica y expira planes cuya fecha de expiración ya pasó
   */
  async verificarPlanesExpirados() {
    if (this.isRunning) {
      console.log('[PLANES CRON] ⏳ Ya hay una verificación en curso, saltando...');
      return;
    }

    const startTime = Date.now();
    this.isRunning = true;
    this.lastRun = new Date();
    this.runCount++;

    console.log(`[PLANES CRON] ▶️  Iniciando verificación #${this.runCount} - ${this.lastRun.toISOString()}`);

    try {
      const db = getDb().db('gb');
      
      // Fecha actual normalizada al inicio del día (medianoche)
      const ahora = dayjs().tz(this.timezone).startOf('day');
      
      console.log(`[PLANES CRON] 📅 Fecha de referencia: ${ahora.format('YYYY-MM-DD HH:mm:ss')}`);

      // Buscar planes activos
      const planesActivos = await db.collection('apps_user_plans')
        .find({ status: 'active' })
        .toArray();

      if (planesActivos.length === 0) {
        console.log('[PLANES CRON] ℹ️  No hay planes activos en el sistema');
        
        const duration = Date.now() - startTime;
        this.lastResult = {
          success: true,
          timestamp: this.lastRun,
          duration: duration,
          planesEncontrados: 0,
          planesExpirados: 0
        };
        
        return;
      }

      console.log(`[PLANES CRON] 📊 Planes activos encontrados: ${planesActivos.length}`);

      // Filtrar planes expirados usando dayjs
      const planesExpirados = planesActivos.filter(plan => {
        const fechaExp = dayjs(plan.fecha_expiracion).tz(this.timezone).startOf('day');
        return fechaExp.isSameOrBefore(ahora);
      });

      if (planesExpirados.length === 0) {
        console.log('[PLANES CRON] ✅ No hay planes para expirar');
        
        const duration = Date.now() - startTime;
        this.lastResult = {
          success: true,
          timestamp: this.lastRun,
          duration: duration,
          planesEncontrados: planesActivos.length,
          planesExpirados: 0
        };
        
        return;
      }

      console.log(`[PLANES CRON] 🔴 Planes a expirar: ${planesExpirados.length}`);

      // IDs de los planes a expirar
      const idsExpirados = planesExpirados.map(p => p._id);

      // Actualizar todos los planes expirados
      const resultado = await db.collection('apps_user_plans').updateMany(
        {
          _id: { $in: idsExpirados }
        },
        {
          $set: {
            status: 'expired',
            expired_at: new Date(),
            updated_at: new Date()
          }
        }
      );

      // Registrar en historial cada plan expirado
      const historialPromises = planesExpirados.map(plan => {
        console.log(`[PLANES CRON] 📝 Plan expirado: Usuario ${plan.uuid} - ${plan.paquete} (expiró: ${dayjs(plan.fecha_expiracion).format('YYYY-MM-DD')})`);
        
        return db.collection('apps_user_plans_history').insertOne({
          uuid: plan.uuid,
          plan_id: plan._id,
          accion: 'expirado',
          paquete: plan.paquete,
          paquete_id: plan.paquete_id,
          fecha_activacion: plan.fecha_activacion,
          fecha_expiracion: plan.fecha_expiracion,
          canales_base: plan.canales_base,
          canales_extra: plan.canales_extra,
          canales_total: plan.canales_total,
          storage_gb: plan.storage_gb,
          fecha_proceso: new Date(),
          procesado_por: 'cron_automatico'
        });
      });

      await Promise.all(historialPromises);

      // Desactivar canales y revocar visualizadores para cada usuario
      console.log('[PLANES CRON] 🔄 Desactivando canales y revocando visualizadores...');
      
      const canalesYVisualizadoresPromises = planesExpirados.map(plan => 
        this.desactivarCanalesYVisualizadores(plan.uuid)
      );

      const canalesYVisualizadoresResultados = await Promise.all(canalesYVisualizadoresPromises);

      // Consolidar resultados
      const totalCanalesDesactivados = canalesYVisualizadoresResultados.reduce(
        (sum, r) => sum + r.canalesDesactivados, 0
      );
      const totalVisualizadoresRevocados = canalesYVisualizadoresResultados.reduce(
        (sum, r) => sum + r.visualizadoresRevocados, 0
      );
      const totalErrores = canalesYVisualizadoresResultados.reduce(
        (arr, r) => arr.concat(r.errores), []
      );

      const duration = Date.now() - startTime;

      this.lastResult = {
        success: true,
        timestamp: this.lastRun,
        duration: duration,
        planesEncontrados: planesActivos.length,
        planesExpirados: resultado.modifiedCount,
        canalesDesactivados: totalCanalesDesactivados,
        visualizadoresRevocados: totalVisualizadoresRevocados,
        errores: totalErrores
      };

      console.log(`[PLANES CRON] ✅ Verificación completada en ${duration}ms`);
      console.log(`[PLANES CRON] 📊 Resultado:`);
      console.log(`   - Planes activos encontrados: ${planesActivos.length}`);
      console.log(`   - Planes expirados: ${resultado.modifiedCount}`);
      console.log(`   - Registros de historial creados: ${historialPromises.length}`);
      console.log(`   - Canales desactivados: ${totalCanalesDesactivados}`);
      console.log(`   - Visualizadores revocados: ${totalVisualizadoresRevocados}`);
      if (totalErrores.length > 0) {
        console.log(`   - Errores: ${totalErrores.length}`);
      }

    } catch (error) {
      const duration = Date.now() - startTime;

      this.lastResult = {
        success: false,
        timestamp: this.lastRun,
        duration: duration,
        error: error.message
      };

      console.error(`[PLANES CRON] ❌ Error en verificación (${duration}ms)`);
      console.error(`[PLANES CRON]`, error);

      // Registrar error en base de datos
      try {
        const db = getDb().db('gb');
        await db.collection('apps_error').insertOne({
          origen: 'PlanesCron',
          error: error.stack,
          data: 'Error en verificación automática de planes expirados',
          created_at: new Date()
        });
      } catch (dbError) {
        console.error('[PLANES CRON] Error al registrar en apps_error:', dbError);
      }

    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Ejecuta el procesamiento manualmente (fuera del schedule)
   */
  async runNow() {
    console.log('[PLANES CRON] 🔄 Ejecución manual solicitada');
    await this.verificarPlanesExpirados();
  }

  /**
   * Obtiene el estado del cron
   */
  getStatus() {
    return {
      enabled: this.isEnabled,
      schedule: this.schedule,
      timezone: this.timezone,
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      lastResult: this.lastResult,
      runCount: this.runCount,
      taskActive: this.task !== null
    };
  }
}

// Instancia singleton
const planesCron = new PlanesCron();

module.exports = planesCron;
