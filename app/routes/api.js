const express = require("express");
const router = express.Router();

const ServiciosController = require("../controllers/servicios.controller");
const ExternosController = require('../controllers/externos.controller');
const ScraperController = require('../controllers/scraper.controller');
const TransporteController = require('../controllers/transporte.controller');
const TurneroController = require('../controllers/turnero.controller');


///////////////// TEST //////////////////////////

router.get("/test-api", (req, res) => {
  res.status(200).send({
    message: "Dynamic service funcionando ok",
    user: req.user,
  });
});

// Lista todos los servicios disponibles ejemplso
router.get("/servicios", ServiciosController.getServicios);
// Obtiene datos de un servicio específico por tipo
// Tipos: test, propiedades, gimnasio, estacionamientos, autos, restaurantes, eventos, productos
router.get("/servicios/:tipo", ServiciosController.getServicio);

//clima - obtiene el clima para una ubicación específica (pais y localidad)
router.post('/extras/clima', ExternosController.getClima)

//procesados - obtiene datos procesados de una colección específica (ej: propiedades, autos, etc)

///////////////// TRANSPORTE (GCBA) //////////////////////////

// Lista modos disponibles (colectivos, subtes, trenes, ecobici, transito) y su estado
router.get('/transporte', TransporteController.getModos);
// Último snapshot guardado en Mongo para un modo específico
router.get('/transporte/:modo', TransporteController.getModo);

///////////////// TURNERO SIMULADO //////////////////////////

// Un servicio que CAMBIA SOLO, para poder probar que un elemento dinámico
// refresca — cosa que con los JSON estáticos de /servicios no se puede ver.
//
// El estado es función del reloj, no azar por pedido: el tiempo se parte en
// ventanas de `cada` segundos y dentro de una ventana la respuesta es siempre la
// misma. Así "cambió" significa "pasó una ventana", que es lo que se quiere
// probar, y no "se volvió a pedir".
//
//   /turnero                        ventanas de 30s, 6 boxes
//   /turnero?cada=15&boxes=8        más rápido y más filas
//
// Devuelve un ARRAY EN LA RAÍZ con objetos planos, que es lo único que el mapeo
// de elementos dinámicos sabe leer.
router.get('/turnero', TurneroController.getTurnero);

///////////////// SCRAPER (BETA) //////////////////////////

// Lista plataformas disponibles para scraping
router.get('/scraper/platforms', ScraperController.getPlatforms);
// Obtiene solo media (imágenes/videos) de una plataforma
router.post('/scraper/media', ScraperController.getMedia);
// Obtiene información completa (título, precio, descripción, etc) de una plataforma
router.post('/scraper/info', ScraperController.getInfo);

// Prometheus metrics endpoint
// ── Métricas de Prometheus: la ruta NO se monta acá, y no es un olvido ──────
//
// Este router cuelga del prefijo que Traefik enruta, así que montar el endpoint
// acá adentro lo deja PÚBLICO — que es exactamente lo que pasó durante meses.
// El registro de `prom-client` se expone en `/internal/metrics`, en la RAÍZ de
// `server.js`: lo que cuelga de la raíz no tiene router en el edge y no es
// alcanzable desde internet.
//
// Verificado el 6/9/2026 contra la config viva de Prometheus: los 6 jobs de las
// apps de tenelo scrapean `/internal/metrics`. Ninguno usaba esta ruta, así que
// borrarla no apagó nada. (Los otros 11 jobs son exportadores de terceros con su
// `/metrics` propio por default: no son excepciones a normalizar, son otra cosa.)
//
// Si vuelve a aparecer la necesidad de exponerla, la respuesta casi siempre es
// mover el scrape a `/internal/metrics`, no remontarla acá.

module.exports = router;
