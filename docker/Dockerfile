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

EXPOSE 44104

CMD ["node", "server.js"]

# Set working directory
WORKDIR /app

# Copy Python dependencies from builder
COPY --from=builder /root/.local /home/appuser/.local

# Copy application code
COPY api.py .
COPY requirements.txt .

# Create downloads directory and set permissions
RUN mkdir -p ${DOWNLOAD_DIR} && \
    chown -R appuser:appuser /app ${DOWNLOAD_DIR}

# Update PATH
ENV PATH=/home/appuser/.local/bin:$PATH

# Switch to non-root user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/api/health')" || exit 1

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
