# Cron Worker separado (server-dynamic-service-cron)

> 14/7/2026 — implementado, no commiteado/pusheado todavía.

## Qué cambió

`server.js` arrancaba `transporteCron.start()` (cron de transporte público, `app/cron/transporte.cron.js`) en el mismo proceso que atiende HTTP. Para poder escalar `server-dynamic-service` a N réplicas sin que cada una ejecute el mismo cron, esa llamada se sacó de `server.js` y se movió a un proceso nuevo, **`cron-worker.js`** (raíz del repo).

## Cómo queda

- **`server.js`**: ya no importa ni arranca `transporteCron`. Solo sirve HTTP.
- **`cron-worker.js`** (nuevo): conecta a la DB y llama a `transporteCron.start()`. Sin Express, no expone HTTP.
- **Infra** (`tenelo-infra/traefik/prd/docker-compose.apps.yml`): nuevo servicio `server-dynamic-service-cron` — misma imagen que `server-dynamic-service`, `command: ["node", "cron-worker.js"]`, sin labels de Traefik, `container_name` fijo, **sin `deploy.replicas`** (queda siempre en 1 instancia).
- **`server-dynamic-service`** (el servicio HTTP) sí pasa a ser escalable (`deploy.replicas` parametrizado por `.env`).

## Por qué no se usó Agenda/Mongo acá

A diferencia de `tenelo-server-app` (que migró su cron dinámico a `@hokify/agenda` — ver `tenelo-server-app/documentacion/CRONS_README.md`), el cron de transporte no tiene creación/edición dinámica vía HTTP. Un `node-cron` simple dentro de un único contenedor `server-dynamic-service-cron` alcanza.

Nota aparte: existe también `app/cron/cron.js`, una clase `GenericCron` genérica ("template para futuras implementaciones") que **no está instanciada ni arrancada en ningún lado** — no participa de este cambio.

Ver también `tenelo-server-app/documentacion/escalado-y-cron-worker.md` para el contexto completo de por qué se aplicó este mismo patrón en varios repos a la vez.
