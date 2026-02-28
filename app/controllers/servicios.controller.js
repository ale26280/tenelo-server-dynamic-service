const fs = require('fs');
const path = require('path');

/**
 * Controlador de Servicios - Provee datos de ejemplo para diferentes rubros
 * 
 * Endpoint: GET /servicios/:tipo
 * 
 * Tipos disponibles:
 * - test: Datos de prueba genéricos
 * - propiedades: Listado de propiedades inmobiliarias
 * - gimnasio: Horarios y clases de gimnasio
 * - estacionamientos: Precios y disponibilidad de estacionamientos
 * - autos: Cotizaciones de vehículos y dólar
 * - restaurantes: Menú y promociones
 * - eventos: Próximos eventos y actividades
 * - productos: Catálogo de productos
 */

/**
 * Obtiene datos de servicio según el tipo solicitado
 * Lee archivos JSON de la carpeta servicios-json/
 */
const getServicio = async (req, res) => {
    try {
        const { tipo } = req.params;
        
        if (!tipo) {
            return res.status(400).send({ 
                error: 'Tipo de servicio no especificado',
                tiposDisponibles: [
                    'test',
                    'propiedades', 
                    'gimnasio',
                    'estacionamientos',
                    'autos',
                    'restaurantes',
                    'eventos',
                    'productos'
                ]
            });
        }

        // Ruta al archivo JSON del servicio
        const servicioPath = path.join(__dirname, '../servicios-json', `${tipo}.json`);

        // Verificar si existe el archivo
        if (!fs.existsSync(servicioPath)) {
            return res.status(404).send({ 
                error: `Servicio '${tipo}' no encontrado`,
                tiposDisponibles: [
                    'test',
                    'propiedades', 
                    'gimnasio',
                    'estacionamientos',
                    'autos',
                    'restaurantes',
                    'eventos',
                    'productos'
                ]
            });
        }

        // Leer y parsear el archivo JSON
        const data = fs.readFileSync(servicioPath, 'utf8');
        const servicio = JSON.parse(data);

        console.log(`✅ Servicio '${tipo}' servido correctamente`);

        return res.status(200).send(servicio);

    } catch (error) {
        console.error('❌ Error al servir servicio:', error.message);
        return res.status(500).send({ 
            error: 'Error al cargar el servicio',
            details: error.message 
        });
    }
};

/**
 * Lista todos los servicios disponibles
 */
const getServicios = async (req, res) => {
    try {
        const serviciosDir = path.join(__dirname, '../servicios-json');

        const base_url = process.env.BASE_URL || 'http://localhost';
        const port = process.env.SERVER_PORT || 3000;
        const prefix = '/ds/v1';
        const origin = `${base_url}`;

        // Leer todos los archivos JSON de la carpeta
        const files = fs.readdirSync(serviciosDir)
            .filter(file => file.endsWith('.json'))
            .map(file => file.replace('.json', ''));

        console.log(`📋 Listando ${files.length} servicios disponibles`);

        return res.status(200).send({
            count: files.length,
            servicios: files,
            endpoint: `${origin}${prefix}/servicios/:tipo`,
            ejemplos: files.map(tipo => `${origin}${prefix}/servicios/${tipo}`)
        });

    } catch (error) {
        console.error('❌ Error al listar servicios:', error.message);
        return res.status(500).send({ 
            error: 'Error al listar servicios',
            details: error.message 
        });
    }
};

module.exports = {
    getServicio,
    getServicios
};
