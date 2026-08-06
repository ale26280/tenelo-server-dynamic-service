# ============================================
# Dockerfile - Tenelo Dynamic Service
# ============================================
FROM node:20-slim

RUN groupadd -g 1001 appgroup \
    && useradd -u 1001 -g appgroup -s /usr/sbin/nologin --no-create-home appuser

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=appuser:appgroup . .

USER appuser

EXPOSE 44105

# Sonda de liveness. Con `node -e` y no con curl/wget: la imagen es node:20-slim
# y no trae ninguno de los dos. El puerto sale de la env y no va hardcodeado,
# que es como lo levanta el compose (SERVER_PORT en .env.server-dynamic-service).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "const p=process.env.SERVER_PORT||44105;const r=require('http').get('http://127.0.0.1:'+p+'/internal/healthz',s=>process.exit(s.statusCode===200?0:1));r.on('error',()=>process.exit(1));r.setTimeout(4000,()=>{r.destroy();process.exit(1)})"

CMD ["node", "server.js"]
