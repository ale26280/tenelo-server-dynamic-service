// ==============================
//  CONFIGURACIÓN PRINCIPAL SERVER
// ==============================

// Carga variables de entorno desde .env
require("dotenv").config();

// Dependencias principales
const express = require("express");
const compression = require("compression");
const helmet = require("helmet");
const morgan = require("morgan");
const cors = require("cors");
const fs = require("fs");
const moment = require("moment-timezone");

// Rutas y base de datos
const api = require("./app/routes/api");
const initDb = require("./config/db").initDb;

// ============================================================================
// CONFIGURACIÓN GLOBAL
// ============================================================================
const CONFIG = {
  base_url: process.env.BASE_URL || "http://localhost",
  port: process.env.SERVER_PORT || 3000,
  prefix: "/ds/v1",
  timezone: "America/Buenos_Aires",
  bodyLimit: "50mb",
};

// Configurar zona horaria global
process.env.TZ = CONFIG.timezone;

// Configuración de variables globales
const app = express();
const path_uploads = process.env.PATH_UPLOADS;

// ==============================
//  MIDDLEWARES DE SEGURIDAD Y RENDIMIENTO
// ==============================

// Comprime respuestas HTTP
app.use(compression());

// Permite solicitudes cross-origin
app.use(cors());

// Protege cabeceras HTTP
app.use(helmet());

// Logging avanzado con fecha local
morgan.token("date", () =>
  moment().tz(CONFIG.timezone).format("YYYY-MM-DD HH:mm:ss"),
);
app.use(
  morgan(
    "[:date[web]] :method :url :status :res[content-length] - :response-time ms",
  ),
);

// Parsers para JSON y formularios
app.use(express.json({ limit: CONFIG.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: CONFIG.bodyLimit }));

// ==============================
//  ENDPOINTS DE MONITOREO Y ARCHIVOS ESTÁTICOS
// ==============================

// Endpoint de versión para monitoreo
app.get("/version", (req, res) => {
  res.status(200).send({
    message: "API dataservice dinamic content funcionando ok",
  });
});

// Expose Prometheus metrics endpoint (configurable via env)
// Prioridad de variables: APP_METRICS_PATH, APP_METRICS_TARGET_PATH, default '/api/v1/metrics'
// metrics route is mounted in app/routes/api.js so it respects the API prefix

// ============================================================================
// RUTAS DE LA API
// ============================================================================

// Montar todas las rutas de la API bajo el prefijo /admin/v1
app.use(`${CONFIG.prefix}`, api);

// ============================================================================
// MIDDLEWARE DE MANEJO DE ERRORES
// ============================================================================

/**
 * Middleware global para manejo de errores
 */
app.use((error, req, res, next) => {
  const timestamp = moment().tz(CONFIG.timezone).format();

  console.error(`[${timestamp}] Error:`, error.message);
  console.error("Stack:", error.stack);

  res.status(500).json({
    error: "Error interno del servidor",
    timestamp: timestamp,
    ...(process.env.NODE_ENV === "development" && {
      details: error.message,
      stack: error.stack,
    }),
  });
});

// ============================================================================
// INICIALIZACIÓN DEL SERVIDOR
// ============================================================================

/**
 * Función para inicializar el servidor
 * 1. Conecta a la base de datos
 * 2. Inicia el servidor HTTP
 */
const startServer = () => {
  initDb((error) => {
    if (error) {
      console.error(
        "❌ Error al conectar con la base de datos:",
        error.message,
      );
      process.exit(1);
    }

    app.listen(CONFIG.port, (error) => {
      if (error) {
        console.error("❌ Error al iniciar el servidor:", error.message);
        process.exit(1);
      }

      const timestamp = moment()
        .tz(CONFIG.timezone)
        .format("YYYY-MM-DD HH:mm:ss");
      console.log(`🚀 [${timestamp}] API App Server iniciado correctamente`);
      console.log(`📡 Puerto: ${CONFIG.port}`);
      console.log(`🌐 Prefijo API: ${CONFIG.prefix}`);
      console.log(`⏰ Zona horaria: ${CONFIG.timezone}`);
      console.log(`📦 Límite de body: ${CONFIG.bodyLimit}`);
      console.log(`🔌 Socket.IO: Activo en path /api/v1/sk`);

      // Iniciar cron de expiración de planes cambiar a mantenimiento
      /*
      try {
        const planesCron = require('./app/cron/planes.cron');
        planesCron.start();
      } catch (err) {
        console.error('⚠️ Error al iniciar cron de planes:', err.message);
      }
        */
    });
  });
};

// ============================================================================
// MANEJO DE SIGNALS DEL SISTEMA
// ============================================================================

/**
 * Manejo graceful del cierre del servidor
 */
process.on("SIGTERM", () => {
  console.log("🛑 Recibida señal SIGTERM. Cerrando servidor...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 Recibida señal SIGINT. Cerrando servidor...");
  process.exit(0);
});

// ============================================================================
// INICIO DE LA APLICACIÓN
// ============================================================================
startServer();
