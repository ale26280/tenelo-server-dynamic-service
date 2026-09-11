/**
 * Turnero simulado — un servicio que CAMBIA SOLO, para probar el circuito
 * de contenido dinámico de punta a punta.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Endpoint: GET /ds/v1/turnero
 *
 * Los servicios de ejemplo de `servicios.controller.js` leen un JSON de disco:
 * sirven para armar y mapear un elemento, pero devuelven siempre lo mismo. Con
 * ellos no hay forma de ver si un elemento REFRESCA — que es justamente lo que
 * hay que poder probar en un elemento fijo, el que vive permanente en pantalla
 * y trae su propio temporizador.
 *
 * ── POR QUÉ NO ES AZAR PURO ───────────────────────────────────────────────
 *
 * "Que cambie al azar cada tanto" se puede hacer con `Math.random()` en cada
 * pedido, y sería inútil para probar:
 *
 *   · dos pantallas del mismo canal mostrarían cosas distintas, así que no se
 *     podría distinguir "refrescó" de "cada una ve otra cosa";
 *   · el valor cambiaría en CADA pedido, así que ver algo distinto no probaría
 *     que el temporizador funcionó — sólo que se volvió a pedir;
 *   · y no habría forma de reproducir un estado para mirarlo dos veces.
 *
 * Acá el estado es una FUNCIÓN DEL RELOJ: el tiempo se parte en ventanas de
 * `cada` segundos y todo lo de una ventana sale de un generador sembrado con su
 * número. Dentro de la ventana la respuesta es estable y cualquiera que pregunte
 * recibe lo mismo; al cruzar el borde cambia entera. Es el mismo criterio con el
 * que un canal sincronizado decide qué elemento le toca: función de la hora, sin
 * que nadie tenga que coordinar nada.
 *
 * Así, "cambió" significa "pasó una ventana", y eso sí prueba el refresco.
 *
 * ── LA FORMA DE LA RESPUESTA NO ES LIBRE ──────────────────────────────────
 *
 * El mapeo de un elemento dinámico mira SÓLO EL PRIMER NIVEL: recorre
 * `Object.keys(item)` y lee `item[campo]`. No aplana ni entiende rutas con
 * punto. Una fuente sirve si devuelve **un array en la raíz con objetos
 * planos** — y si la raíz es un objeto, el elemento muestra UNA sola fila.
 *
 * Por eso esto devuelve el array pelado, igual que los JSON de `servicios-json`,
 * y por eso los campos no anidan nada. El `meta` que sería cómodo para depurar
 * viaja en cabeceras `X-Turnero-*`, donde no rompe el mapeo.
 */

/**
 * Generador pseudoaleatorio sembrado (mulberry32).
 *
 * Hace falta uno propio porque `Math.random()` no se puede sembrar: sin semilla
 * no hay forma de que dos procesos —o el mismo, dos veces— lleguen al mismo
 * resultado para la misma ventana, que es toda la idea de esto.
 */
function generador(semilla) {
  let a = semilla >>> 0;
  return function siguiente() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SECTORES = ['Atención al público', 'Caja', 'Trámites', 'Turnos', 'Reclamos'];
const ESTADOS = ['Llamando', 'En atención', 'Libre'];

/** Entero en [min, max], a partir del generador. */
const entre = (rnd, min, max) => min + Math.floor(rnd() * (max - min + 1));

/** Lee un número de la query con límites, o el default si no es válido. */
function numero(valor, porDefecto, min, max) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/**
 * GET /ds/v1/turnero
 *
 *   ?cada=30      segundos que dura cada ventana (5 … 3600, default 30)
 *   ?boxes=6      cuántos puestos devuelve       (1 … 50,   default 6)
 *   ?prefijo=A    letra del número de turno      (default A)
 *
 * Devuelve un array de puestos. Dentro de una misma ventana la respuesta es
 * siempre idéntica; al pasar a la siguiente cambian los turnos, los estados y
 * las esperas.
 */
const getTurnero = async (req, res) => {
  try {
    const cada = numero(req.query.cada, 30, 5, 3600);
    const boxes = numero(req.query.boxes, 6, 1, 50);
    const prefijo = String(req.query.prefijo || 'A').slice(0, 3).toUpperCase();

    // El número de ventana es lo único que siembra todo. Dos pedidos dentro del
    // mismo intervalo comparten semilla y por lo tanto respuesta.
    const ahora = Date.now();
    const ventana = Math.floor(ahora / (cada * 1000));
    const rnd = generador(ventana);

    // El contador de turnos avanza con las ventanas en vez de ser aleatorio: un
    // turnero que retrocede se nota a simple vista y haría dudar del refresco en
    // vez de demostrarlo.
    const base = ventana % 900;

    const filas = [];
    for (let i = 0; i < boxes; i += 1) {
      const estado = ESTADOS[entre(rnd, 0, ESTADOS.length - 1)];
      const libre = estado === 'Libre';
      const numeroTurno = base + i + 1;

      filas.push({
        // Nombres pensados para que el mapeo del panel se lea solo. Todos planos
        // y todos de tipo simple: un objeto acá se mostraría como "[object Object]".
        turno: libre ? '—' : `${prefijo}-${String(numeroTurno).padStart(3, '0')}`,
        box: `Box ${i + 1}`,
        estado,
        sector: SECTORES[entre(rnd, 0, SECTORES.length - 1)],
        espera: libre ? '—' : `${entre(rnd, 1, 25)} min`,
        enCola: entre(rnd, 0, 40),
        // Una marca legible para poder ver EN PANTALLA cuándo se renovó, sin
        // mirar logs: es la forma más directa de comprobar que un elemento fijo
        // volvió a consultar.
        actualizado: new Date(ventana * cada * 1000).toISOString(),
      });
    }

    // El contexto va en cabeceras y no en el cuerpo: metido adentro obligaría a
    // envolver el array en un objeto, y ahí el mapeo pasa a ver una sola fila.
    res.set('X-Turnero-Ventana', String(ventana));
    res.set('X-Turnero-Cada', String(cada));
    res.set('X-Turnero-Proximo-Cambio', new Date((ventana + 1) * cada * 1000).toISOString());
    // Sin caché: el sentido de esto es que el valor cambie cuando tiene que
    // cambiar, y un intermediario guardándolo arruinaría la prueba entera.
    res.set('Cache-Control', 'no-store');

    console.log(`🎫 Turnero: ventana ${ventana} (cada ${cada}s), ${boxes} boxes`);

    return res.status(200).send(filas);
  } catch (error) {
    console.error('❌ Error en turnero:', error.message);
    return res.status(500).send({
      error: 'Error al generar el turnero',
      details: error.message,
    });
  }
};

module.exports = { getTurnero };
