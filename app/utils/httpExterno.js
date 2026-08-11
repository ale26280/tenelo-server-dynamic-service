'use strict'

/**
 * Cliente HTTP para salidas a SERVICIOS DE TERCEROS.
 *
 * Copia alineada del mismo archivo en tenelo-server-app. Si se toca uno, tocar
 * el otro.
 *
 * Por qué existe
 * ──────────────
 * El axios global es compartido por todo el proceso. Mientras
 * `midelware/authorization.js` escribía el `Authorization` del usuario en
 * `axios.defaults.headers.common`, ese header quedaba pegado y se lo llevaba
 * cualquier llamada axios posterior que no pasara headers propios.
 *
 * Este servicio es el peor caso de todo el ecosistema para eso: casi todo lo
 * que hace es salir a internet —geocoding, clima, scrapers de Shopify y
 * MercadoLibre, APIs de transporte—, y ninguna de esas llamadas pasa headers.
 * O sea que los JWT de usuarios de tenelo se estaban yendo a todos esos
 * destinos. Los tokens duran 50 días y no se pueden revocar.
 *
 * La causa ya está arreglada en el middleware. Esta instancia es la segunda
 * línea: `axios.create()` copia `axios.defaults` UNA VEZ al cargar el módulo
 * (cuando está limpio) y las mutaciones posteriores del global no llegan acá.
 *
 * Cuándo usarlo
 * ─────────────
 * SIEMPRE que el destino no sea un servicio de tenelo.
 *
 * Cómo verificar que sigue limpio
 * ───────────────────────────────
 *   grep -rn "axios.defaults.headers" app/
 *
 * Tiene que dar cero.
 */

const axios = require('axios')

const TIMEOUT_MS = Number(process.env.HTTP_EXTERNO_TIMEOUT_MS || 15000)

const httpExterno = axios.create({
  timeout: TIMEOUT_MS
})

// No toca los headers a propósito —algunas de estas llamadas llevan su propia
// autorización y borrarla las rompería—. Sólo avisa si alguien volvió a
// ensuciar el axios global, que es la regresión que queremos ver temprano.
httpExterno.interceptors.request.use((config) => {
  const globalSucio =
    axios.defaults &&
    axios.defaults.headers &&
    axios.defaults.headers.common &&
    (axios.defaults.headers.common.Authorization || axios.defaults.headers.common.Session)

  if (globalSucio) {
    console.error(
      '[httpExterno] REGRESIÓN: axios.defaults.headers.common tiene credenciales.',
      'Alguien volvió a escribir en los defaults globales — es la fuga de JWT a terceros.',
      'Buscar con: grep -rn "axios.defaults.headers" app/'
    )
  }

  return config
})

module.exports = httpExterno
