# 🚀 Tenelo Server Dynamic Service

Servidor backend Node.js/Express para la plataforma Tenelo.


## 🏃 Quick Start

### Instalación

```bash
npm install
```

### Configuración

```bash
cp .env.example .env
# Editar .env con tus configuraciones
```

### Ejecutar

```bash
# Desarrollo
npm start

# Producción con PM2
pm2 start ecosystem.config.js
```



## 📦 Estructura del Proyecto

```
tenelo-server-app/
├── app/
│   ├── controllers/      # Controladores de rutas
│   ├── cron/           # Jobs programados
│   ├── middlewares/    # Middlewares Express
│   └── routes/         # Definición de rutas
├── config/            # Configuración (DB, etc)
├── documentacion/     # 📚 Documentación técnica
├── monitoring/        # Prometheus + Grafana
```


## 🌐 Endpoints Principales

- **/ds/v1/** - API principal
- **/metrics** - Métricas Prometheus

Ver [api.js](./app/routes/api.js) para lista completa de endpoints.

## 📊 Monitoreo

Ver [monitoring/README.md](./monitoring/README.md) para configurar Prometheus y Grafana.

## 🤝 Contribuir

Antes de contribuir, revisa la documentación relevante en [`documentacion/`](./documentacion/).

## 📝 Licencia

Propietario - Tenelo

---

**Para más información, ver [documentacion/README.md](./documentacion/README.md)**
