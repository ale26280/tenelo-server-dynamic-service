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

// Map para gestionar solicitudes pendientes y evitar cache stampede
// Cuando múltiples requests llegan al mismo tiempo para la misma ubicación,
// solo uno consulta la API y los demás esperan el resultado compartido
const pendingRequests = new Map();

// Configuración del caché (30 minutos)
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutos

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
    
    // Normalizar fechas a UTC para evitar problemas de zona horaria
    const nowUTC = new Date();
    const cacheExpiry = new Date(nowUTC.getTime() - CACHE_DURATION_MS);

    console.log("🌤️ [CLIMA DEBUG] Buscando en cache con key:", locationKey);
    console.log("🌤️ [CLIMA DEBUG] Fecha actual UTC:", nowUTC.toISOString());
    console.log(
      "🌤️ [CLIMA DEBUG] Tiempo límite cache (30 min):",
      cacheExpiry.toISOString(),
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
      console.log("🔍 [CLIMA DEBUG] Consultando cache con query:", {
        locationKey: locationKey,
        "updatedAt >= ": cacheExpiry.toISOString(),
      });
      
      cachedData = await collection.findOne({
        locationKey: locationKey,
        updatedAt: { $gte: cacheExpiry },
      });
    }

    if (cachedData) {
      console.log("✅ [CLIMA DEBUG] Datos encontrados en cache válido");
      console.log(
        "🌤️ [CLIMA DEBUG] Cache updatedAt:",
        cachedData.updatedAt?.toISOString ? cachedData.updatedAt.toISOString() : cachedData.updatedAt,
      );
      console.log(
        "🌤️ [CLIMA DEBUG] Edad del cache (min):",
        Math.round((nowUTC - new Date(cachedData.updatedAt)) / 1000 / 60),
      );
      
      // Datos en cache válidos (menos de 30 minutos)
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
    } else if (useCache) {
      console.log("❌ [CLIMA DEBUG] No se encontró cache válido o está expirado");
    }

    // Verificar si hay una solicitud en proceso para esta ubicación
    if (pendingRequests.has(locationKey)) {
      console.log(
        `⏳ [CLIMA DEBUG] Solicitud ya en proceso para ${locationKey}, esperando resultado compartido...`,
      );

      try {
        // Esperar el resultado de la solicitud en proceso
        const sharedResult = await pendingRequests.get(locationKey);

        console.log(
          `✅ [CLIMA DEBUG] Resultado compartido recibido para ${locationKey}`,
        );

        response.data = {
          temperatura: sharedResult.temperatura,
          humedad: sharedResult.humedad,
          ubicacion: sharedResult.ubicacion,
          timestamp: sharedResult.timestamp,
          fromCache: true,
          fromSharedRequest: true, // Indica que vino de una solicitud compartida
          cacheEnabled: useCache,
          total: 1,
        };
        response.message =
          "Datos obtenidos de solicitud concurrente (optimización)";
        return res.json(response);
      } catch (sharedError) {
        console.log(
          `⚠️ [CLIMA DEBUG] Error en solicitud compartida, continuando con nueva solicitud`,
        );
        // Si falla la solicitud compartida, continuar con nueva solicitud
      }
    }

    console.log(
      "🔍 [CLIMA DEBUG] No hay datos en cache válido, consultando APIs externas",
    );

    // Crear promesa para compartir con requests concurrentes
    const fetchPromise = (async () => {
      try {
        return await fetchWeatherData(pais, localidad, locationKey);
      } finally {
        // Limpiar el lock después de completar (éxito o error)
        pendingRequests.delete(locationKey);
        console.log(
          `🔓 [CLIMA DEBUG] Lock liberado para ${locationKey}`,
        );
      }
    })();

    // Registrar la promesa para que otros requests la puedan usar
    pendingRequests.set(locationKey, fetchPromise);
    console.log(
      `🔒 [CLIMA DEBUG] Lock adquirido para ${locationKey}, requests concurrentes esperarán`,
    );

    try {
      // Esperar el resultado de la consulta a las APIs
      const weatherResult = await fetchPromise;

      // Guardar en cache si está habilitado
      if (useCache) {
        // Crear timestamp fresco en el momento de guardar (no usar el `now` del inicio)
        const saveTimestamp = new Date();
        
        const climaData = {
          locationKey: locationKey,
          pais: pais,
          localidad: localidad,
          ubicacion: weatherResult.ubicacion,
          temperatura: weatherResult.temperatura,
          humedad: weatherResult.humedad,
          weatherData: weatherResult.weatherData,
          updatedAt: saveTimestamp,
          createdAt: saveTimestamp,
        };

        console.log(
          "💾 [CLIMA DEBUG] Guardando datos en cache con key:",
          locationKey,
        );
        console.log(
          "💾 [CLIMA DEBUG] Timestamp guardado (UTC):",
          saveTimestamp.toISOString(),
        );

        await collection.replaceOne(
          { locationKey: locationKey },
          climaData,
          { upsert: true },
        );

        console.log("✅ [CLIMA DEBUG] Datos guardados exitosamente en cache");
      }

      // Respuesta exitosa
      response.data = {
        temperatura: weatherResult.temperatura,
        humedad: weatherResult.humedad,
        ubicacion: weatherResult.ubicacion,
        timestamp: weatherResult.timestamp, // Timestamp de cuando se obtuvieron los datos
        fromCache: false,
        cacheEnabled: useCache,
        total: 1,
      };
      response.message = "Datos del clima obtenidos exitosamente";

      console.log("📤 [CLIMA] Request recibida:", { pais, localidad });
      console.log("📤 [CLIMA] Respuesta enviada:", response.data);

      return res.json(response);
    } catch (fetchError) {
      console.error(
        "❌ [CLIMA DEBUG] Error al consultar APIs externas:",
        fetchError.message,
      );

      // Manejar diferentes tipos de errores
      if (fetchError.isNotFound) {
        response.status = 404;
        response.message = fetchError.message;
        response.extra = fetchError.extra;
        return res.status(404).json(response);
      }

      if (fetchError.isMultipleLocations) {
        response.data = fetchError.data;
        response.message = fetchError.message;
        return res.json(response);
      }

      response.status = 500;
      response.message = "Error al consultar el servicio de clima externo";
      response.error = fetchError.message;
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

/**
 * Función auxiliar para consultar las APIs de clima
 * Extrae la lógica de geocoding y consulta meteorológica
 */
async function fetchWeatherData(pais, localidad, locationKey) {
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

      const error = new Error(
        `No se encontró la ubicación "${localidad}" en "${pais}". Intenta con una ciudad específica.`,
      );
      error.isNotFound = true;
      error.extra = {
        searchedQueries: searchQueries,
        suggestion:
          "Intenta con el nombre de una ciudad específica dentro de la provincia/región",
      };
      throw error;
    }

    // Si hay múltiples resultados, devolver opciones para que el usuario elija
    if (geocodingData.results.length > 1) {
      console.log(
        "🔄 [CLIMA DEBUG] Múltiples ubicaciones encontradas:",
        geocodingData.results.length,
      );

      const error = new Error(
        "Se encontraron múltiples ubicaciones. Por favor, especifica cuál deseas.",
      );
      error.isMultipleLocations = true;
      error.data = {
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
      throw error;
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
    throw new Error("No se pudo obtener la temperatura actual");
  }

  // Retornar datos del clima con timestamp del momento de obtención
  return {
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
    timestamp: new Date(), // Momento en que se obtuvieron los datos de la API
  };
}

module.exports = {
  getClima,
};
