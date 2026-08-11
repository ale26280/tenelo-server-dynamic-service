var jwt = require('jsonwebtoken')
var axios = require('axios')
//midelware
const authUrl = process.env.AUTH_URL
const pl = process.env.PL
const jwtSecret = process.env.AUTH_JWT_SECRET || 'userdata'

// Ver el mismo comentario en tenelo-server-app: sin timeout, un auth colgado
// dejaba el request esperando para siempre.
const AUTH_TIMEOUT_MS = Number(process.env.AUTH_TIMEOUT_MS || 8000)

/**
 * Este archivo es la copia alineada del `ensureAuth` de tenelo-server-app.
 * Si se toca la lógica de clasificación, hay que tocarla en los tres
 * (server-app, server-media, server-dynamic-service) o los clientes van a ver
 * comportamientos distintos según qué servicio les contestó.
 *
 * La regla, igual que allá:
 *
 *   401 SÓLO ante una respuesta explícita de que el token no vale.
 *   Cualquier otra falla —auth caído, timeout, respuesta ininteligible— es 503,
 *   que el cliente trata como "no se pudo verificar" y NO cierra la sesión.
 *
 * De paso se arreglan tres cosas que esta versión tenía y server-app no:
 *
 *  1. `axios.defaults.headers.common` — global al proceso, dejaba el token del
 *     usuario pegado para cualquier llamada axios posterior. Ahora va por
 *     request.
 *  2. `let res` adentro del try TAPABA el `res` de Express. Nadie lo usaba
 *     dentro del bloque, pero era una trampa esperando a que alguien quisiera
 *     responder ahí adentro.
 *  3. El catch hacía `res.json(e)` SIN status: una falla de autenticación
 *     respondía **HTTP 200** con el error en el body. Para el cliente eso es un
 *     éxito — un fallo mudo de manual.
 */
const AUTH_INVALIDA = 'sesion_invalida'         // → 401, el token no sirve
const AUTH_NO_DISPONIBLE = 'auth_no_disponible' // → 503, no se pudo verificar

function fallaDeSesion(message) {
  const e = new Error(message)
  e.tipo = AUTH_INVALIDA
  return e
}

function fallaDeInfra(message, causa) {
  const e = new Error(message)
  e.tipo = AUTH_NO_DISPONIBLE
  e.causa = causa
  return e
}

function clasificarErrorDeAuth(error) {
  const status = error && error.response && error.response.status

  if (!status) {
    return fallaDeInfra('No se pudo contactar el servicio de sesión', error && error.code)
  }

  if (status === 401 || status === 403) {
    return fallaDeSesion('Sesión inválida o expirada')
  }

  return fallaDeInfra(`El servicio de sesión respondió ${status}`, status)
}

exports.ensureAuth = async function (req, res, next) {

  try {

    if (!req.headers.authorization) {
      throw fallaDeSesion('Falta el header Authorization')
    }

    var token = req.headers.authorization.replace(/['"]+/g, '')

    if (token.indexOf('Bearer ') === -1) {
      throw fallaDeSesion('El token no viene como Bearer')
    }

    token = token.replace('Bearer ', '')

    // `authRes`, no `res`: el `res` de Express tiene que seguir siendo el de
    // Express en todo el cuerpo de la función.
    let authRes

    try {
      // Headers POR REQUEST. No volver a `axios.defaults.headers.common`:
      // es global al proceso y filtra el token del usuario a cualquier llamada
      // axios que no pase headers propios, incluidas las salidas a terceros.
      authRes = await axios.post(
        authUrl,
        {
          data: {
            access_token: token,
            pl: pl,
            session: req.headers.session
          }
        },
        {
          headers: {
            Authorization: 'Bearer ' + token,
            Session: req.headers.session || ''
          },
          timeout: AUTH_TIMEOUT_MS
        }
      )
    } catch (error) {
      const clasificado = clasificarErrorDeAuth(error)
      console.warn(
        '[ensureAuth] Falló la validación de sesión:',
        clasificado.tipo,
        '|', clasificado.message,
        '| causa:', clasificado.causa || '(sin causa)',
        '|', req.method, req.originalUrl
      )
      throw clasificado
    }

    if (authRes.data.success === false) {
      throw fallaDeSesion(authRes.data.message || 'Sesión inválida')
    }

    let useruuid

    try {
      // Sincrónico, sin callback. La versión anterior usaba el callback de
      // jwt.verify y hacía `throw` ADENTRO: si esa librería alguna vez llamara
      // el callback de forma asincrónica, la excepción saldría fuera del try y
      // nadie la agarraría.
      const decoded = jwt.verify(authRes.data.user, jwtSecret)
      useruuid = decoded.user.uuid
      req.user = decoded.user
      req.userRole = decoded.user.role
    } catch (jwtErr) {
      // No es 401: lo que falló es la confianza entre servicios (secreto que no
      // coincide), no la sesión del usuario. Un 401 acá haría que una env var
      // mal puesta desloguee a toda la base de una.
      console.error('[ensureAuth] No se pudo verificar el usertoken:', jwtErr.message)
      throw fallaDeInfra('No se pudo verificar la identidad devuelta por el servicio de sesión', 'jwt_verify')
    }

    req.uuid = useruuid

    next()

  }

  catch (e) {

    const esInvalida = e && e.tipo === AUTH_INVALIDA

    return res.status(esInvalida ? 401 : 503).json({
      success: false,
      code: esInvalida ? AUTH_INVALIDA : AUTH_NO_DISPONIBLE,
      message: esInvalida
        ? (e && e.message ? e.message : 'Sesión inválida')
        : 'No se pudo verificar la sesión en este momento'
    })

  }

}

exports.public = function (req, res, next) {
  next()
}
