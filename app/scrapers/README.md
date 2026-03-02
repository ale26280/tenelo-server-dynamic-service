# 🔍 Scrapers Modulares - Feature BETA

Sistema modular de scrapers para autocompletar información de usuarios desde distintas plataformas.

## 📁 Arquitectura Desacoplada

Cada plataforma tiene su propio scraper independiente:

```
app/scrapers/
├── mercadolibre.scraper.js  ✅ Activo (API pública)
├── shopify.scraper.js       ✅ Activo (endpoint público)
├── tiktok.scraper.js        ⏳ Pendiente
├── instagram.scraper.js     ⏳ Pendiente
└── tiendamia.scraper.js     ⏳ Pendiente
```

## 🎯 Endpoints Disponibles

### 1. Listar Plataformas
```http
GET /ds/v1/scraper/platforms
```

### 2. Obtener Solo Media (imágenes/videos)
```http
POST /ds/v1/scraper/media
Content-Type: application/json

{
  "platform": "mercadolibre",
  "username": "SELLER_ID",
  "limit": 20
}
```

### 3. Obtener Info Completa
```http
POST /ds/v1/scraper/info
Content-Type: application/json

{
  "platform": "shopify",
  "username": "mitienda.myshopify.com",
  "limit": 20
}
```

## 💡 Ejemplos de Uso

### Mercado Libre
```bash
curl -X POST http://localhost:3000/ds/v1/scraper/media \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "mercadolibre",
    "username": "179571326",
    "limit": 10
  }'
```

### Shopify
```bash
curl -X POST http://localhost:3000/ds/v1/scraper/info \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "shopify",
    "username": "tienda.myshopify.com",
    "limit": 15
  }'
```

## 🛠️ Cómo Agregar un Nuevo Scraper

### 1. Crear el archivo del scraper
```javascript
// app/scrapers/nueva_plataforma.scraper.js

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 horas
const cache = new Map();

async function getMedia(username, limit = 20) {
    // Implementar lógica para obtener solo media
    return [
        {
            type: 'image',
            url: 'https://...',
            productId: '123'
        }
    ];
}

async function getInfo(username, limit = 20) {
    // Implementar lógica para obtener info completa
    return [
        {
            id: '123',
            title: 'Producto',
            price: 100,
            currency: 'ARS',
            images: ['https://...'],
            description: 'Descripción',
            url: 'https://...'
        }
    ];
}

module.exports = { getMedia, getInfo };
```

### 2. Registrar en el controlador
Agregar en `app/controllers/scraper.controller.js`:

```javascript
const nuevaPlataformaScraper = require('../scrapers/nueva_plataforma.scraper');

const SCRAPERS = {
    // ... otros scrapers
    'nuevaplataforma': nuevaPlataformaScraper
};
```

¡Y listo! El endpoint ya estará disponible.

## ⚡ Features

- ✅ **Caché de 24 horas** - Reduce rate limiting y mejora performance
- ✅ **Modular** - Fácil agregar/modificar scrapers
- ✅ **Desacoplado** - Cada plataforma es independiente
- ✅ **Timeout protection** - 10 segundos máximo por request
- ✅ **Error handling** - Mensajes claros de error

## 📝 Notas

- **Mercado Libre**: Usa API pública oficial. Requiere seller_id válido.
- **Shopify**: Usa endpoint público `/products.json`. Funciona con la mayoría de tiendas.
- **TikTok/Instagram**: Requieren APIs de terceros o scraping avanzado (pendiente).

## 🔐 Rate Limiting

El caché de 24 horas ayuda a respetar los límites de las plataformas:
- **Mercado Libre**: Sin límites documentados para búsquedas públicas
- **Shopify**: Sin límites para endpoints públicos (usar con moderación)
