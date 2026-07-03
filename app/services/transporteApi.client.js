const axios = require('axios');

/**
 * Cliente de la API Transporte Público (GCBA)
 * https://data.buenosaires.gob.ar/dataset/api-transporte-publico
 *
 * Endpoints y comportamiento verificados en vivo con credenciales reales:
 * - colectivos (vehiclePositions?json=1): OK
 * - subtes (forecastGTFS): OK
 * - ecobici (gbfs/stationStatus): OK
 * - trenes (vehiclePositions?json=1): 404 "No listener for endpoint" - el
 *   producto no está suscripto/habilitado para este client_id (o fue dado
 *   de baja del gateway). No es un problema de path/params: se probaron
 *   feed-gtfs, vehiclePositions y vehiclePositions?json=1, todos 404.
 * - transito (v1/eventos, v1/cortes): 500 consistente sin importar el path
 *   o los parámetros (probado con y sin `month`) - falla del lado del
 *   backend de GCBA, no de este cliente.
 * Sin json=1, colectivos/subtes/trenes devuelven protobuf GTFS-realtime
 * binario en vez de JSON.
 */

const BASE_URL = process.env.TRANSPORTE_API_BASE_URL || 'https://apitransporte.buenosaires.gob.ar';
const CLIENT_ID = process.env.TRANSPORTE_CLIENT_ID;
const CLIENT_SECRET = process.env.TRANSPORTE_CLIENT_SECRET;

function isConfigured() {
  return !!(CLIENT_ID && CLIENT_SECRET);
}

async function request(path, params = {}) {
  try {
    const response = await axios.get(`${BASE_URL}${path}`, {
      params: {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        ...params,
      },
      timeout: 10000,
    });
    return response.data;
  } catch (error) {
    if (error.response && [401, 403].includes(error.response.status)) {
      const authError = new Error(`Credenciales inválidas para API Transporte (${error.response.status})`);
      authError.isAuthError = true;
      throw authError;
    }
    throw error;
  }
}

// Colectivos: posiciones en tiempo real de las unidades
function getColectivosPositions() {
  return request('/colectivos/vehiclePositions', { json: 1 });
}

// Subtes: pronóstico de arribos por línea/estación
function getSubtesForecast() {
  return request('/subtes/forecastGTFS');
}

// Trenes: posiciones en tiempo real de las formaciones
// Devuelve 404 con las credenciales actuales - producto no suscripto/no
// habilitado del lado de GCBA. Ver nota en el header del archivo.
function getTrenesPositions() {
  return request('/trenes/vehiclePositions', { json: 1 });
}

// Ecobici: estado de estaciones (bicis/anclajes disponibles)
function getEcobiciStations() {
  return request('/ecobici/gbfs/stationStatus');
}

// Tránsito: eventos en la vía pública (cortes, manifestaciones, etc)
// Devuelve 500 de forma consistente del lado de GCBA. Ver nota en el header
// del archivo.
function getTransitoEventos() {
  return request('/transito/v1/eventos');
}

module.exports = {
  isConfigured,
  getColectivosPositions,
  getSubtesForecast,
  getTrenesPositions,
  getEcobiciStations,
  getTransitoEventos,
};
