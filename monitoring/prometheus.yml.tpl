global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'app_metrics'
    scheme: '${APP_METRICS_SCHEME}'
    scrape_interval: ${APP_METRICS_SCRAPE_INTERVAL}
    scrape_timeout: ${APP_METRICS_SCRAPE_TIMEOUT}
    metrics_path: '${APP_METRICS_TARGET_PATH}'
    static_configs:
      - targets: ['${APP_METRICS_TARGET_HOST}']
