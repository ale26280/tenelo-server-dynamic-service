Monitorización local (stack rápido)

Este `docker-compose.monitor.yml` crea un entorno local de prueba con:
- Redis
- redis_exporter
- Prometheus (configurable para apuntar a la URL de métricas de la app)
- Grafana

Importante: este compose NO integra la app dentro del mismo stack. El objetivo es probar la monitorización conectando Prometheus a la URL de métrica expuesta por tu app (por ejemplo: `http://host:metrics_port/metrics`).

Cómo usar:

1) Define la variable de entorno `APP_METRICS_TARGET` apuntando a la URL de métricas de la app.

   Ejemplo si la app corre en `http://host.docker.local:9229/metrics`:

   ```bash
   export APP_METRICS_TARGET="host.docker.local:9229"
   docker compose -f docker-compose.monitor.yml up -d
   ```

2) Acceder:
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000 (user: admin / pwd: admin)

3) Importar dashboards en Grafana o crear paneles con métricas del `redis_exporter` y la `app_metrics`.

Notas:
- El template de Prometheus usa `envsubst` para inyectar `APP_METRICS_TARGET` en el archivo de configuración en runtime.
- En producción, configura Prometheus para acceder a la URL de métricas de tu app con la ruta y puerto correctos.

