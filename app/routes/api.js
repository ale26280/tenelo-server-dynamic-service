const express = require("express");
const router = express.Router();

const ServiciosController = require("../controllers/servicios.controller");
const ExternosController = require('../controllers/externos.controller')


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


module.exports = router;
