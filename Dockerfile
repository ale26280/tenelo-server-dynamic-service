# ============================================
# Dockerfile - Tenelo Server Dynamic Service
# ============================================
FROM node:20-slim

RUN groupadd -g 1001 appgroup \
    && useradd -u 1001 -g appgroup -s /usr/sbin/nologin --no-create-home appuser

RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY --chown=appuser:appgroup . .

USER appuser

EXPOSE 44105

CMD ["node", "server.js"]
