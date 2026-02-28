#!/bin/sh
# Fail fast on most errors and treat unset vars as errors where possible
set -eu

# Defaults (can be overridden via .env on the compose or env_file)
APP_METRICS_TARGET_HOST=${APP_METRICS_TARGET_HOST:-host.docker.internal:44300}
APP_METRICS_TARGET_PATH=${APP_METRICS_TARGET_PATH:-/api/v1/metrics}
APP_METRICS_SCHEME=${APP_METRICS_SCHEME:-http}
APP_METRICS_SCRAPE_INTERVAL=${APP_METRICS_SCRAPE_INTERVAL:-15s}
APP_METRICS_SCRAPE_TIMEOUT=${APP_METRICS_SCRAPE_TIMEOUT:-10s}

export APP_METRICS_TARGET_HOST APP_METRICS_TARGET_PATH APP_METRICS_SCHEME APP_METRICS_SCRAPE_INTERVAL APP_METRICS_SCRAPE_TIMEOUT

echo "render-prometheus.sh: using APP_METRICS_TARGET_HOST=${APP_METRICS_TARGET_HOST}"

# Ensure template exists
if [ ! -f /tpl/prometheus.yml.tpl ]; then
  echo "ERROR: template /tpl/prometheus.yml.tpl not found" >&2
  exit 2
fi

# Ensure envsubst is available; try to install but fail clearly if unable
if ! command -v envsubst >/dev/null 2>&1; then
  echo "envsubst not found, trying to install gettext (apk)" >&2
  if command -v apk >/dev/null 2>&1; then
    apk add --no-cache gettext || { echo "ERROR: apk install failed" >&2; exit 3; }
  else
    echo "ERROR: package manager 'apk' not found; cannot install envsubst" >&2
    exit 4
  fi
fi

# Render and verify
if ! envsubst < /tpl/prometheus.yml.tpl > /output/prometheus.yml; then
  echo "ERROR: envsubst failed to render template" >&2
  exit 5
fi

echo "prometheus config rendered to /output/prometheus.yml"

# Basic sanity check: file is non-empty
if [ ! -s /output/prometheus.yml ]; then
  echo "ERROR: rendered /output/prometheus.yml is empty" >&2
  exit 6
fi

echo "render-prometheus.sh: done"
