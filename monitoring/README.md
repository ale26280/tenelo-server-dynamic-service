Monitoring compose

This folder contains a small Docker Compose stack to run Prometheus and Grafana to scrape metrics from an external API exposed by the application.

Key points
- The init container `prometheus-init` renders `prometheus.yml.tpl` into a named volume `prometheus-config`.
- Prometheus is configured to read `/etc/prometheus/prometheus.yml` from that volume.
- The stack expects the target app metrics to be reachable from inside Docker containers. Set `APP_METRICS_TARGET_HOST` in `.env` (see `.env.example`).

Quick start
1. Copy `.env.example` to `.env` and edit `APP_METRICS_TARGET_HOST` so it points to the app from the container (e.g. `host.docker.internal:44300` or the container IP/host:port).
2. From this folder run:

Monitoring compose

This folder contains a small Docker Compose stack to run Prometheus and Grafana to scrape metrics from an external API exposed by the application.

Key points
- The init container `prometheus-init` renders `prometheus.yml.tpl` into a named volume `prometheus-config`.
- Prometheus reads `/etc/prometheus/prometheus.yml` from that volume.
- The stack expects the target app metrics to be reachable from inside Docker containers. Set `APP_METRICS_TARGET_HOST` in `.env` (see `.env.example`). In this repo we currently use `192.168.0.134:44300`.

Quick start
1. Copy `.env.example` to `.env` and edit `APP_METRICS_TARGET_HOST` if needed:

```bash
cd monitoring
cp .env.example .env
# Edit .env and configure APP_METRICS_TARGET_HOST
```

2. Start the stack (detached):

```bash
docker compose -f docker-compose.monitor.yml up -d --build
```

Stopping and cleaning (safe)
- Stop containers:

```bash
docker compose -f docker-compose.monitor.yml down
```

- Stop and remove volumes (destructive: removes stored prometheus/grafana data):

```bash
docker compose -f docker-compose.monitor.yml down -v
```

Force remove containers and volumes (if something quedó colgado):

```bash
docker compose -f docker-compose.monitor.yml down --rmi local -v --remove-orphans
```

Recreate and verify

```bash
# rebuild and start fresh
docker compose -f docker-compose.monitor.yml up -d --build

# follow logs
docker compose -f docker-compose.monitor.yml logs -f prometheus-init prometheus grafana
```

Verificación rápida
- Prometheus UI: http://localhost:30016/targets (debe mostrar job `app_metrics` UP)
- Prometheus query API de ejemplo:

```bash
curl 'http://192.168.0.134:30016/api/v1/query?query=sum%20by%20(canal)%20(sse_connections)'
```

- Grafana UI: http://localhost:30015 (admin password en `.env`, variable `GF_SECURITY_ADMIN_PASSWORD`)

Provisioning dashboards
- Un dashboard `App metrics (metrics.js)` se agregó en `grafana/dashboards/app-metrics.json` y Grafana está configurada para cargar dashboards desde `/var/lib/grafana/dashboards`.

Notas
- Si el init falla intentando instalar paquetes dentro del contenedor (apk), el host debe tener acceso a Internet desde Docker. Alternativamente se puede usar una imagen init que ya incluya `envsubst` para acelerar el arranque.

Si querés, ahora continuo: (a) paro la stack, (b) elimino volúmenes, (c) levanto todo desde cero y (d) compruebo que Prometheus y Grafana muestran el dashboard y targets.
