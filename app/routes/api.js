const express = require("express");
const router = express.Router();

const ServiciosController = require("../controllers/servicios.controller");

///////////////// TEST //////////////////////////

router.get("/test-api", (req, res) => {
  res.status(200).send({
    message: "Dynamic service funcionando ok",
    user: req.user,
  });
});

// Lista todos los servicios disponibles
router.get("/servicios", ServiciosController.getServicios);
// Obtiene datos de un servicio específico por tipo
// Tipos: test, propiedades, gimnasio, estacionamientos, autos, restaurantes, eventos, productos
router.get("/servicios/:tipo", ServiciosController.getServicio);

module.exports = router;
