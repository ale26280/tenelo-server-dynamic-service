// Proceso dedicado a los cron jobs internos de tenelo-server-dynamic-service.
// Corre separado del servidor HTTP (no levanta Express) para poder escalar
// server-dynamic-service a N réplicas sin duplicar la ejecución de estos cron.
// Uso: node cron-worker.js  (command override en docker-compose, ver server-dynamic-service-cron)

require("dotenv").config();
const initDb = require("./config/db").initDb;
const transporteCron = require("./app/cron/transporte.cron");

initDb((error) => {
  if (error) {
    console.error("❌ Error al conectar con la base de datos:", error.message);
    process.exit(1);
  }

  console.log("🚀 Cron Worker (server-dynamic-service) iniciado correctamente");
  transporteCron.start();
});

process.on("SIGTERM", () => {
  console.log("🛑 Recibida señal SIGTERM. Cerrando cron worker...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 Recibida señal SIGINT. Cerrando cron worker...");
  process.exit(0);
});
