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

// Configuración de providers de clima (en orden de prioridad)
// Para agregar API keys, usar variables de entorno: WEATHERAPI_KEY, OPENWEATHERMAP_KEY
// Priority 1 = Provider principal (se intenta primero)
const WEATHER_PROVIDERS = {
  weatherapi: {
    name: 'WeatherAPI',
    enabled: !!process.env.WEATHERAPI_KEY || true, // Habilitado siempre, requiere API key
    priority: 1, // 🌟 PROVIDER PRINCIPAL
    requiresApiKey: true,
    apiKey: process.env.WEATHERAPI_KEY,
    info: '100K llamadas/mes gratis - https://www.weatherapi.com/signup.aspx'
  },
  openmeteo: {
    name: 'Open-Meteo',
    enabled: true, // Siempre habilitado como fallback
    priority: 2, // Fallback (sin API key, gratis ilimitado)
    requiresApiKey: false,
    apiKey: null,
    info: 'Gratis ilimitado - No requiere API key'
  },
  openweathermap: {
    name: 'OpenWeatherMap',
    enabled: !!process.env.OPENWEATHERMAP_KEY,
    priority: 3, // Tercer opción (si está configurado)
    requiresApiKey: true,
    apiKey: process.env.OPENWEATHERMAP_KEY,
    info: '1000 llamadas/día gratis - https://openweathermap.org/api'
  },
};

// Obtener providers habilitados ordenados por prioridad
function getEnabledProviders() {
  return Object.entries(WEATHER_PROVIDERS)
    .filter(([_, config]) => config.enabled)
    .sort((a, b) => a[1].priority - b[1].priority)
    .map(([key, _]) => key);
}

// Log inicial: Mostrar providers habilitados al cargar el módulo
(() => {
  const enabled = getEnabledProviders();
  console.log('🌤️ [CLIMA] Providers de clima habilitados:');
  enabled.forEach((key, index) => {
    const config = WEATHER_PROVIDERS[key];
    const status = config.requiresApiKey && !config.apiKey ? '⚠️ (Sin API key)' : '✅';
    console.log(`  ${index + 1}. ${status} ${config.name} - ${config.info ||'Sin info'}`);
  });
  if (enabled.length === 0) {
    console.warn('⚠️ [CLIMA] ADVERTENCIA: No hay providers habilitados');
  }
})();

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

    // Obtener provider preferido (opcional, si no se especifica usa fallback automático)
    const preferredProvider = req.body.provider || req.query.provider || null;
    if (preferredProvider) {
      console.log("🌤️ [CLIMA] Provider solicitado:", preferredProvider);
    }

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
        provider: cachedData.provider || 'unknown', // Provider que se usó originalmente
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
          provider: sharedResult.provider || 'unknown',
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
        return await fetchWeatherData(pais, localidad, locationKey, preferredProvider);
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
          provider: weatherResult.provider, // Guardar qué provider se usó
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
        provider: weatherResult.provider, // Qué provider se usó
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

      // FALLBACK FINAL: Si todos los providers fallaron, intentar usar cache expirado
      console.log(
        "🔄 [CLIMA DEBUG] Todos los providers fallaron, buscando cache expirado como fallback...",
      );
      
      const expiredCacheData = await collection.findOne({
        locationKey: locationKey,
      });

      if (expiredCacheData) {
        const cacheAge = Math.round((nowUTC - new Date(expiredCacheData.updatedAt)) / 1000 / 60);
        console.log(
          `⚠️ [CLIMA DEBUG] Usando cache expirado (${cacheAge} minutos de antigüedad)`,
        );

        response.data = {
          temperatura: expiredCacheData.temperatura,
          humedad: typeof expiredCacheData.humedad === "undefined" ? null : expiredCacheData.humedad,
          ubicacion: expiredCacheData.ubicacion,
          timestamp: expiredCacheData.updatedAt,
          provider: `${expiredCacheData.provider || 'unknown'} (cache expirado)`,
          fromCache: true,
          cacheExpired: true,
          cacheAgeMinutes: cacheAge,
          cacheEnabled: useCache,
          total: 1,
        };
        response.message = `⚠️ Datos del cache expirado (${cacheAge} min) - Todos los providers fallaron`;
        
        return res.json(response);
      }

      // Si no hay cache disponible, devolver error
      console.error("❌ [CLIMA DEBUG] No hay cache disponible como fallback");
      response.status = 500;
      response.message = "Error al consultar el servicio de clima externo y no hay cache disponible";
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
 * Implementa fallback automático entre múltiples providers
 * 
 * @param {string} pais - País
 * @param {string} localidad - Ciudad/localidad
 * @param {string} locationKey - Clave única de ubicación
 * @param {string|null} preferredProvider - Provider preferido (opcional)
 */
async function fetchWeatherData(pais, localidad, locationKey, preferredProvider = null) {
  const enabledProviders = getEnabledProviders();
  
  // Si se especifica un provider preferido y está habilitado, intentar primero con ese
  let providersToTry = [...enabledProviders];
  if (preferredProvider && WEATHER_PROVIDERS[preferredProvider]?.enabled) {
    providersToTry = [
      preferredProvider,
      ...enabledProviders.filter(p => p !== preferredProvider)
    ];
  }

  console.log(`🌐 [CLIMA] Providers disponibles para intentar:`, providersToTry);

  let lastError = null;

  // Intentar con cada provider en orden
  for (const provider of providersToTry) {
    try {
      console.log(`🔄 [CLIMA] Intentando con provider: ${WEATHER_PROVIDERS[provider].name}`);
      
      let result;
      switch (provider) {
        case 'openmeteo':
          result = await fetchFromOpenMeteo(pais, localidad);
          break;
        case 'weatherapi':
          result = await fetchFromWeatherAPI(pais, localidad);
          break;
        case 'openweathermap':
          result = await fetchFromOpenWeatherMap(pais, localidad);
          break;
        default:
          console.log(`⚠️ [CLIMA] Provider desconocido: ${provider}`);
          continue;
      }

      // Si llegamos aquí, el provider funcionó
      console.log(`✅ [CLIMA] Datos obtenidos exitosamente de ${WEATHER_PROVIDERS[provider].name}`);
      result.provider = provider; // Agregar info del provider usado
      return result;

    } catch (error) {
      console.log(`❌ [CLIMA] Error con ${WEATHER_PROVIDERS[provider].name}:`, error.message);
      lastError = error;
      
      // Si es un error de "no encontrado" o "múltiples ubicaciones", no intentar con otros providers
      if (error.isNotFound || error.isMultipleLocations) {
        throw error;
      }
      
      // Continuar con el siguiente provider
      continue;
    }
  }

  // Si llegamos aquí, ningún provider funcionó
  console.error(`❌ [CLIMA] Todos los providers fallaron`);
  throw lastError || new Error('No se pudo obtener datos del clima de ningún provider');
}

/**
 * Adaptador para Open-Meteo (gratis, sin API key)
 */
async function fetchFromOpenMeteo(pais, localidad) {
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

/**
 * Adaptador para WeatherAPI (gratis, requiere API key)
 * https://www.weatherapi.com/
 * 1M llamadas/mes gratis
 */
async function fetchFromWeatherAPI(pais, localidad) {
  const apiKey = WEATHER_PROVIDERS.weatherapi.apiKey;
  
  if (!apiKey) {
    throw new Error('WeatherAPI requiere API key (WEATHERAPI_KEY env variable)');
  }

  // WeatherAPI permite geocoding + clima en una sola llamada
  const query = `${localidad}, ${pais}`;
  const url = `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(query)}&aqi=no`;

  try {
    const response = await axios.get(url);
    const data = response.data;

    // WeatherAPI devuelve todo en una respuesta
    return {
      ubicacion: {
        name: data.location.name,
        country: data.location.country || pais,
        latitude: data.location.lat,
        longitude: data.location.lon,
        timezone: data.location.tz_id,
      },
      temperatura: data.current.temp_c,
      humedad: data.current.humidity,
      weatherData: {
        condition: data.current.condition.text,
        wind_kph: data.current.wind_kph,
        pressure_mb: data.current.pressure_mb,
        feelslike_c: data.current.feelslike_c,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    if (error.response?.status === 400) {
      // Location not found
      const err = new Error(`No se encontró la ubicación "${localidad}" en "${pais}"`);
      err.isNotFound = true;
      err.extra = {
        suggestion: "Intenta con el nombre de una ciudad específica",
      };
      throw err;
    }
    throw error;
  }
}

/**
 * Adaptador para OpenWeatherMap (gratis, requiere API key)
 * https://openweathermap.org/api
 * 1000 llamadas/día gratis
 */
async function fetchFromOpenWeatherMap(pais, localidad) {
  const apiKey = WEATHER_PROVIDERS.openweathermap.apiKey;
  
  if (!apiKey) {
    throw new Error('OpenWeatherMap requiere API key (OPENWEATHERMAP_KEY env variable)');
  }

  // Paso 1: Geocoding
  const geoUrl = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(localidad)},${encodeURIComponent(pais)}&limit=5&appid=${apiKey}`;
  
  try {
    const geoResponse = await axios.get(geoUrl);
    const locations = geoResponse.data;

    if (!locations || locations.length === 0) {
      const error = new Error(`No se encontró la ubicación "${localidad}" en "${pais}"`);
      error.isNotFound = true;
      error.extra = {
        suggestion: "Intenta con el nombre de una ciudad específica",
      };
      throw error;
    }

    if (locations.length > 1) {
      const error = new Error("Se encontraron múltiples ubicaciones. Por favor, especifica cuál deseas.");
      error.isMultipleLocations = true;
      error.data = {
        multipleLocations: true,
        total: locations.length,
        options: locations.map((loc) => ({
          name: loc.name,
          country: loc.country || "",
          admin1: loc.state || "",
          latitude: loc.lat,
          longitude: loc.lon,
        })),
      };
      throw error;
    }

    const location = locations[0];

    // Paso 2: Obtener clima actual
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${location.lat}&lon=${location.lon}&appid=${apiKey}&units=metric`;
    const weatherResponse = await axios.get(weatherUrl);
    const weather = weatherResponse.data;

    return {
      ubicacion: {
        name: location.name,
        country: location.country || pais,
        latitude: location.lat,
        longitude: location.lon,
        timezone: weather.timezone ? `UTC${weather.timezone/3600}` : 'UTC',
      },
      temperatura: weather.main.temp,
      humedad: weather.main.humidity,
      weatherData: {
        description: weather.weather[0]?.description,
        feels_like: weather.main.feels_like,
        pressure: weather.main.pressure,
        wind_speed: weather.wind.speed,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    if (error.isNotFound || error.isMultipleLocations) {
      throw error;
    }
    throw new Error(`Error consultando OpenWeatherMap: ${error.message}`);
  }
}

module.exports = {
  getClima,
};
