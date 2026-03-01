// Importaciones necesarias
const ObjectId = require("mongodb").ObjectId;
const getDb = require("../../config/db").getDb;
const axios = require("axios");

// Respuesta base reutilizable (inmutable)
const baseResponse = {
  status: 200,
  data: [],
  message: null,
  extra: [],
};

// Helper: stringify/preview large objects safely for logs
function preview(obj, maxChars = 2000) {
  try {
    const s = JSON.stringify(obj, null, 2);
    return s.length > maxChars ? s.slice(0, maxChars) + "... (truncated)" : s;
  } catch (e) {
    return String(obj);
  }
}

/**
 * Obtiene información del clima para una ubicación específica
 * Implementa cache inteligente para evitar consultas repetitivas
 */
async function getClima(req, res, next) {
  try {
    console.log("🌤️ [CLIMA DEBUG] Iniciando consulta de clima");

    // Crear una respuesta nueva por petición (no compartir estado entre peticiones)
    let response = Object.assign({}, baseResponse);
    response.error = [];

    const { pais, localidad } = req.body;
    console.log("🌤️ [CLIMA] Parámetros recibidos:", { pais, localidad });

    // Validar parámetros requeridos
    if (!pais || !localidad) {
      console.log("❌ [CLIMA DEBUG] Parámetros faltantes");
      response.status = 400;
      response.message = "Los parámetros pais y localidad son requeridos";
      return res.status(400).json(response);
    }

    const db = getDb().db("tenelo");
    const collection = db.collection("apps_climas");

    // Crear clave única para la ubicación
    const locationKey = `${pais.toLowerCase()}_${localidad.toLowerCase()}`;
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    console.log("🌤️ [CLIMA DEBUG] Buscando en cache con key:", locationKey);
    console.log(
      "🌤️ [CLIMA DEBUG] Tiempo límite cache:",
      oneHourAgo.toISOString(),
    );

    // Determinar si se debe usar cache (por defecto true). Se puede pasar en body.useCache (boolean)
    // o en query string ?useCache=false
    const useCache = (() => {
      if (req.body && typeof req.body.useCache === "boolean")
        return req.body.useCache;
      if (req.query && typeof req.query.useCache === "string")
        return req.query.useCache !== "false";
      // por defecto true: usar cache si existe
      return true;
    })();

    // Buscar en cache (si está habilitado)
    let cachedData = null;
    if (useCache) {
      cachedData = await collection.findOne({
        locationKey: locationKey,
        updatedAt: { $gte: oneHourAgo },
      });
    }

    if (cachedData) {
      console.log("✅ [CLIMA DEBUG] Datos encontrados en cache válido");
      // Datos en cache válidos (menos de 1 hora)
      response.data = {
        temperatura: cachedData.temperatura,
        humedad:
          typeof cachedData.humedad === "undefined" ? null : cachedData.humedad,
        ubicacion: cachedData.ubicacion,
        timestamp: cachedData.updatedAt,
        fromCache: true,
        cacheEnabled: useCache,
        total: 1,
      };
      response.message = "Datos obtenidos del cache";
      return res.json(response);
    }

    console.log(
      "🔍 [CLIMA DEBUG] No hay datos en cache válido, consultando APIs externas",
    );

    // Buscar coordenadas usando la API de geocoding con múltiples estrategias
    const searchQueries = [
      `${localidad}, ${pais}`, // Estrategia principal: "Chubut, Argentina"
      `${pais}, ${localidad}`, // Estrategia alternativa: "Argentina, Chubut"
      localidad, // Solo localidad: "Chubut"
      `${localidad} ${pais}`, // Sin coma: "Chubut Argentina"
    ];

    let geocodingData = null;
    let usedQuery = "";

    for (const searchQuery of searchQueries) {
      const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchQuery)}`;

      try {
        const geocodingResponse = await axios.get(geocodingUrl);
        const data = geocodingResponse.data;
        if (data.results && data.results.length > 0) {
          geocodingData = data;
          usedQuery = searchQuery;
          // encontrado
          break;
        }
      } catch (apiError) {
        console.log("⚠️ [CLIMA] Error en geocoding:", apiError.message);
        if (apiError.response) {
          console.log(
            "⚠️ [CLIMA] Geocoding API responded with status",
            apiError.response.status,
          );
        }
        continue;
      }
    }

    if (
      !geocodingData ||
      !geocodingData.results ||
      geocodingData.results.length === 0
    ) {
      console.log(
        "❌ [CLIMA DEBUG] No se encontró la ubicación con ninguna estrategia",
      );
      response.status = 404;
      response.message = `No se encontró la ubicación "${localidad}" en "${pais}". Intenta con una ciudad específica.`;
      response.extra = {
        searchedQueries: searchQueries,
        suggestion:
          "Intenta con el nombre de una ciudad específica dentro de la provincia/región",
      };
      return res.status(404).json(response);
    }

    // Si hay múltiples resultados, devolver opciones para que el usuario elija
    if (geocodingData.results.length > 1) {
      console.log(
        "🔄 [CLIMA DEBUG] Múltiples ubicaciones encontradas:",
        geocodingData.results.length,
      );
      response.data = {
        multipleLocations: true,
        total: geocodingData.results.length,
        options: geocodingData.results.map((location) => ({
          name: location.name,
          country: location.country || "",
          admin1: location.admin1 || "",
          latitude: location.latitude,
          longitude: location.longitude,
          timezone: location.timezone,
        })),
      };
      response.message =
        "Se encontraron múltiples ubicaciones. Por favor, especifica cuál deseas.";
      return res.json(response);
    }

    // Usar la primera (y única) ubicación encontrada
    const location = geocodingData.results[0];
    console.log("📍 [CLIMA DEBUG] Ubicación seleccionada:", {
      name: location.name,
      country: location.country,
      lat: location.latitude,
      lon: location.longitude,
      searchQuery: usedQuery,
    });

    try {
      // Consultar el clima actual
      // Request temperature and relative humidity
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&hourly=temperature_2m,relativehumidity_2m&timezone=${location.timezone}&forecast_days=1`;

      const weatherResponse = await axios.get(weatherUrl);
      const weatherData = weatherResponse.data;

      // Obtener la temperatura y humedad actuales (primera hora disponible)
      const currentTemperature = weatherData.hourly?.temperature_2m?.[0];
      const currentHumidity = weatherData.hourly?.relativehumidity_2m?.[0];

      if (currentTemperature === undefined) {
        console.log("❌ [CLIMA DEBUG] No se pudo obtener temperatura actual");
        response.status = 500;
        response.message = "No se pudo obtener la temperatura actual";
        return res.status(500).json(response);
      }

      // temperatura y humedad obtenidas (si están disponibles)

      // Preparar datos para guardar en cache
      const climaData = {
        locationKey: locationKey,
        pais: pais,
        localidad: localidad,
        ubicacion: {
          name: location.name,
          country: location.country || "",
          latitude: location.latitude,
          longitude: location.longitude,
          timezone: location.timezone,
        },
        temperatura: currentTemperature,
        humedad: currentHumidity,
        weatherData: {
          hourly: weatherData.hourly,
          timezone: weatherData.timezone,
        },
        updatedAt: now,
        createdAt: now,
      };

      if (useCache) {
        console.log(
          "💾 [CLIMA DEBUG] Guardando datos en cache con key:",
          locationKey,
        );
        // Actualizar o insertar en cache
        await collection.replaceOne({ locationKey: locationKey }, climaData, {
          upsert: true,
        });

        console.log("✅ [CLIMA DEBUG] Datos guardados exitosamente en cache");
      } else {
        // no guardar en cache
      }

      // Respuesta exitosa
      response.data = {
        temperatura: currentTemperature,
        humedad: currentHumidity,
        ubicacion: climaData.ubicacion,
        timestamp: now,
        fromCache: false,
        cacheEnabled: useCache,
        total: 1,
      };
      response.message = "Datos del clima obtenidos exitosamente";
      // Log limpio: lo que recibimos y lo que respondemos
      console.log("📤 [CLIMA] Request recibida:", { pais, localidad });
      console.log("📤 [CLIMA] Respuesta enviada:", response.data);
      return res.json(response);
    } catch (fetchError) {
      console.error(
        "❌ [CLIMA DEBUG] Error al consultar APIs externas:",
        fetchError.message,
      );
      if (fetchError.response) {
        console.error(
          "❌ [CLIMA DEBUG] External API responded with:",
          preview(fetchError.response.data, 1200),
        );
        console.error(
          "❌ [CLIMA DEBUG] External request URL (error):",
          fetchError.config?.url,
        );
      }
      console.error("❌ [CLIMA DEBUG] Stack trace:", fetchError.stack);
      response.status = 500;
      response.message = "Error al consultar el servicio de clima externo";
      return res.status(500).json(response);
    }
  } catch (error) {
    console.error("❌ [CLIMA DEBUG] Error general en getClima:", error.message);
    console.error("❌ [CLIMA DEBUG] Stack trace:", error.stack);
    response.status = 500;
    response.message = "Error interno del servidor";
    response.error = error.message;
    return res.status(500).json(response);
  }
}

module.exports = {
  getClima,
};
