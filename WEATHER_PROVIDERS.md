# ☁️ Configuración de Providers de Clima

## 🚀 Quick Start

**¿Empezando ahora? Sigue estos pasos:**

1. **Sin configurar (desarrollo):** ✅ Ya funciona con Open-Meteo (gratis, sin API key)
2. **Para producción (recomendado):** 
   - Obtén API key gratis: https://www.weatherapi.com/signup.aspx (2 minutos)
   - Agrega: `export WEATHERAPI_KEY="tu_key"`
   - Reinicia servidor
   - ✅ Listo: 100K llamadas/mes (~66 usuarios activos)

**TL;DR:** WeatherAPI FREE + Open-Meteo fallback = Mejor opción calidad/precio 🏆

---

## 📑 Índice

1. [Comparación de Providers](#-comparación-de-providers)
2. [Escenarios Recomendados](#-escenarios-recomendados)
3. [Pros y Contras Detallados](#️-pros-y-contras-detallados)
4. [Detalles de Configuración](#-detalles-de-configuración)
5. [Cálculo de Llamadas](#-cálculo-de-llamadas-con-caché-30-min)
6. [Comparación de Costos](#-comparación-de-costos-vs-competencia)
7. [Configuración](#️-configuración)
8. [Sistema de Fallback](#-funcionamiento-del-sistema-de-fallback)
9. [Troubleshooting](#-troubleshooting)

---

## 📊 Comparación de Providers

| Característica | WeatherAPI 🌟 | Open-Meteo | OpenWeatherMap |
|----------------|---------------|------------|----------------|
| **Prioridad** | 1️⃣ Principal | 2️⃣ Fallback | 3️⃣ Opcional |
| **Precio FREE** | $0/mes | $0/mes | $0/mes |
| **Llamadas/mes** | 100,000 | ♾️ Ilimitado | ~30,000 (1K/día) |
| **API Key requerida** | ✅ Sí | ❌ No | ✅ Sí |
| **Tarjeta crédito** | ❌ No | ❌ No | ❌ No |
| **Velocidad respuesta** | ⚡ ~500ms | 🐢 ~2s | ⚡ ~600ms |
| **Llamadas por request** | 1️⃣ (geocoding+clima) | 2️⃣ (geocoding→clima) | 2️⃣ (geocoding→clima) |
| **Datos históricos** | ✅ 24 horas | ❌ No | ❌ No (pago) |
| **Forecast** | ✅ 3 días | ✅ 16 días | ✅ 5 días |
| **Uptime** | 99.9% | 99.5% | 99.9% |
| **Usuarios con caché 30min** | ~66 | ♾️ | ~20 |
| **Escalar ($7/mes)** | ~2,000 usuarios | N/A | ~600 usuarios |

### 🏆 Veredicto

**Para tu caso (frontends consultando cada 15 min):**
- 🥇 **WeatherAPI** - Mejor opción con API key (más rápida, una sola llamada)
- 🥈 **Open-Meteo** - Excelente fallback gratuito (sin límites)
- 🥉 **OpenWeatherMap** - Límite muy bajo para apps activas

### 💡 Escenarios Recomendados

#### 🧪 **Desarrollo / Testing**
```
✅ Open-Meteo solo (sin configurar nada)
```
- Sin registro, sin API key
- Perfecto para prototipar
- Ilimitado y gratis

#### 🚀 **Producción Pequeña (< 50 usuarios)**
```
✅ WeatherAPI FREE + Open-Meteo fallback
```
- Registrar en WeatherAPI (2 minutos)
- 100K llamadas/mes = ~66 usuarios activos
- Open-Meteo como backup automático

#### 📈 **Producción Media (50-2000 usuarios)**
```
✅ WeatherAPI STARTER ($7/mes) + Open-Meteo fallback
```
- 3M llamadas/mes = ~2,000 usuarios activos
- Alta confiabilidad
- Costo muy bajo

#### 🏢 **Producción Grande (> 2000 usuarios)**
```
✅ WeatherAPI PRO+ ($25/mes) + todos los fallbacks
```
- 5M llamadas/mes = ~3,300 usuarios activos
- Máxima redundancia
- Habilitar OpenWeatherMap como 3er backup

---

## �📋 Providers Disponibles
### ⚖️ **Pros y Contras Detallados**

#### 🌟 **WeatherAPI** (Recomendado para producción)

**✅ PROS:**
- Una sola llamada HTTP (geocoding + clima juntos)
- Respuestas muy rápidas (~500ms)
- Datos históricos incluidos (24 horas)
- Forecast de 3 días en FREE
- Sin tarjeta de crédito en FREE
- Mejor precio por llamada en planes pagos
- Dashboard con estadísticas y uso

**❌ CONTRAS:**
- Requiere registro y API key
- Límite de 100K/mes en FREE
- Sin datos históricos extensos en FREE

**💰 COSTO ESCALADO:**
- FREE: 100K llamadas
- STARTER: $7/mes → 3M llamadas
- ROI: $0.0035 por usuario/mes

---

#### 🌤️ **Open-Meteo** (Recomendado para FREE)

**✅ PROS:**
- Completamente gratis e ilimitado
- Sin registro, sin API key
- Sin tarjeta de crédito
- Forecast de hasta 16 días
- Código abierto
- Muy buena documentación
- Nunca falla por límites

**❌ CONTRAS:**
- 2 llamadas HTTP (geocoding + clima)
- Más lento (~2s total)
- Sin datos históricos
- Sin garantía de SLA
- Puede ser más lento en horas pico

**💰 COSTO ESCALADO:**
- Siempre $0 (ilimitado)

---

#### 🌍 **OpenWeatherMap** (NO recomendado actualmente)

**✅ PROS:**
- Muy conocido y popular
- Datos precisos
- Sin tarjeta en FREE

**❌ CONTRAS:**
- Solo 1,000 llamadas/día (30K/mes)
- 2 llamadas HTTP necesarias
- Muy caro en planes pagos ($145/mes por 3M)
- Límite muy bajo para apps activas
- Datos históricos solo en planes ENTERPRISE

**💰 COSTO ESCALADO:**
- FREE: 30K llamadas (~20 usuarios)
- Professional: $145/mes → 3M llamadas
- ROI: $0.048 por usuario/mes (14x más caro que WeatherAPI)

---

## 📋 Detalles de Configuración
### 1. 🌟 **WeatherAPI** (Provider Principal)
- **Prioridad:** 1 (se intenta primero)
- **URL:** https://www.weatherapi.com/
- **Plan FREE:** 100,000 llamadas/mes (100K)
- **Requiere API Key:** ✅ Sí
- **Ventajas:** 
  - Geocoding + clima en una sola llamada
  - Muy confiable y rápida
  - Datos en tiempo real + histórico (últimas 24 horas)
  - 3 días de forecast

#### 🔑 Cómo obtener API Key:
1. Registrarse en: https://www.weatherapi.com/signup.aspx
2. Verificar email
3. Copiar API Key del dashboard
4. Agregar a variables de entorno:
   ```bash
   export WEATHERAPI_KEY="tu_api_key_aqui"
   ```

#### 💰 Planes Disponibles (si necesitas escalar):
- **FREE**: $0/mes - 100K llamadas/mes ✅ (sin tarjeta)
- **STARTER**: $7/mes - 3M llamadas/mes  
- **PRO+**: $25/mes - 5M llamadas/mes
- **BUSINESS**: $65/mes - 10M llamadas/mes  
- **ENTERPRISE**: Custom - Personalizado

> 💡 **Tip:** Con caché de 30 min + 100K llamadas/mes, soportas ~66 usuarios activos consultando cada 15 min durante todo el mes.

---

### 2. 🌤️ **Open-Meteo** (Fallback Automático)
- **Prioridad:** 2 (se usa si WeatherAPI falla o no tiene API key)
- **URL:** https://open-meteo.com/
- **Plan Gratis:** Ilimitado
- **Requiere API Key:** ❌ No
- **Ventajas:**
  - Totalmente gratis
  - Sin límites
  - Sin registro necesario

---

### 3. 🌍 **OpenWeatherMap** (Opcional)
- **Prioridad:** 3 (deshabilitado por defecto)
- **URL:** https://openweathermap.org/api
- **Plan Gratis:** 1000 llamadas/día
- **Requiere API Key:** ✅ Sí
- **Ventajas:**
  - Muy popular
  - Datos precisos

#### 🔑 Cómo habilitar:
1. Registrarse en: https://openweathermap.org/appid
2. Obtener API Key
3. Agregar a variables de entorno:
   ```bash
   export OPENWEATHERMAP_KEY="tu_api_key_aqui"
   ```

---

## ⚙️ Configuración

### Variables de Entorno

Crear archivo `.env` en la raíz del proyecto:

```bash
# Provider principal (recomendado)
WEATHERAPI_KEY=tu_weather_api_key_aqui

# Provider opcional
OPENWEATHERMAP_KEY=tu_openweather_key_aqui
```

### Ejemplo con PM2

En `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'tenelo-server',
    script: './server.js',
    env: {
      WEATHERAPI_KEY: 'tu_api_key',
      OPENWEATHERMAP_KEY: 'tu_api_key_opcional'
    }
  }]
};
```

---

## 🔄 Funcionamiento del Sistema de Fallback

```
Request → Caché (30 min) 
          └─ Si no existe o expiró
             └─ 1️⃣ Intenta WeatherAPI
                 ├─ ✅ Éxito → Guarda en caché → Responde
                 └─ ❌ Fallo
                     └─ 2️⃣ Intenta Open-Meteo
                         ├─ ✅ Éxito → Guarda en caché → Responde
                         └─ ❌ Fallo
                             └─ 3️⃣ Intenta OpenWeatherMap (si está habilitado)
                                 ├─ ✅ Éxito → Guarda en caché → Responde
                                 └─ ❌ Fallo → Error 500
```

---

## 📊 Respuesta API

La API siempre indica qué provider se utilizó:

```json
{
  "status": 200,
  "data": {
    "temperatura": 22.5,
    "humedad": 65,
    "ubicacion": {
      "name": "Buenos Aires",
      "country": "Argentina",
      "latitude": -34.61,
      "longitude": -58.37,
      "timezone": "America/Argentina/Buenos_Aires"
    },
    "timestamp": "2026-03-01T17:14:23.993Z",
    "provider": "weatherapi",  // ← Provider usado
    "fromCache": false,
    "cacheEnabled": true,
    "total": 1
  },
  "message": "Datos del clima obtenidos exitosamente"
}
```

---

## 🚀 Sin Configurar API Keys

Si no configuras `WEATHERAPI_KEY`, el sistema automáticamente usa **Open-Meteo** como provider principal (gratis, ilimitado, sin API key).

```
Request → WeatherAPI ❌ (sin API key)
       → Open-Meteo ✅ (funciona siempre)
```

---

## 🧪 Probar Providers

```bash
# Con WeatherAPI (si está configurado)
curl -X POST http://localhost:3000/extras/clima \
  -H "Content-Type: application/json" \
  -d '{"pais":"Argentina","localidad":"Buenos Aires"}'

# Forzar un provider específico (opcional)
curl -X POST http://localhost:3000/extras/clima \
  -H "Content-Type: application/json" \
  -d '{"pais":"Argentina","localidad":"Buenos Aires","preferredProvider":"openmeteo"}'
```

---

## 📝 Logs

Al iniciar el servidor verás:

```
🌤️ [CLIMA] Providers de clima habilitados:
  1. ✅ WeatherAPI - 100K llamadas/mes gratis
  2. ✅ Open-Meteo - Gratis ilimitado - No requiere API key
```

Si WeatherAPI no tiene API key:

```
🌤️ [CLIMA] Providers de clima habilitados:
  1. ⚠️ (Sin API key) WeatherAPI - 100K llamadas/mes gratis
  2. ✅ Open-Meteo - Gratis ilimitado - No requiere API key
```

---

## 📌 Recomendaciones

1. **Desarrollo:** Usar solo Open-Meteo (gratis, sin configuración)
2. **Producción:** Configurar WeatherAPI para mejor confiabilidad
3. **Alta disponibilidad:** Configurar todos los providers

### 📊 Cálculo de Llamadas con Caché (30 min)

Con el sistema de caché de 30 minutos implementado:

#### 🧮 **Fórmula de Cálculo**

```
Llamadas por usuario/día = (60 min/hora × 24 horas) / frecuencia de consulta
Con caché de 30 min: 48 llamadas/día (consulta cada 30 min efectivo)

Usuarios soportados = Límite mensual / (llamadas/día × 30 días)
```

#### 📈 **Tabla de Capacidad por Plan**

| Plan | Llamadas/mes | Usuarios Activos* | Costo | Costo/Usuario |
|------|--------------|-------------------|-------|---------------|
| **WeatherAPI FREE** | 100K | ~66 | $0 | $0 |
| **WeatherAPI STARTER** | 3M | ~2,000 | $7 | $0.0035 |
| **WeatherAPI PRO+** | 5M | ~3,300 | $25 | $0.0075 |
| **WeatherAPI BUSINESS** | 10M | ~6,600 | $65 | $0.0098 |
| **Open-Meteo** | ♾️ Ilimitado | ♾️ | $0 | $0 |
| **OpenWeatherMap FREE** | 30K | ~20 | $0 | $0 |

*Usuarios consultando cada 15 min con caché de 30 min

#### 💰 **Ejemplo Real**

**App con 100 usuarios activos:**
- Sin caché: 100 × 96 llamadas/día = 9,600/día = **288,000/mes** ⚠️
- Con caché 30 min: 100 × 48 llamadas/día = 4,800/día = **144,000/mes** ✅
- Plan necesario: **STARTER ($7/mes)** ✅

**Ahorro con caché:** 50% de llamadas a la API

---

### 🎯 **Cuándo Actualizar de Plan**

```
FREE (100K)     → Hasta 66 usuarios    → $0/mes
STARTER (3M)    → Hasta 2,000 usuarios → $7/mes  (creces 30x)
PRO+ (5M)       → Hasta 3,300 usuarios → $25/mes (creces 50x)
BUSINESS (10M)  → Hasta 6,600 usuarios → $65/mes (creces 100x)
```

**Recomendación:** Empezar con FREE, escalar cuando llegues a ~50 usuarios activos.

### 💸 **Comparación de Costos vs Competencia**

| Servicio | Plan | Llamadas/mes | Costo | Costo por 1M llamadas |
|----------|------|--------------|-------|-----------------------|
| **WeatherAPI** | STARTER | 3M | $7 | **$2.33** ✅ Mejor |
| OpenWeatherMap | Professional | 3M | $145 | $48.33 |
| Weatherstack | Standard | 500K | $50 | $100 |
| AccuWeather | Standard | 3.6M/año (300K/mes) | $25/mes | $83.33 |
| **Open-Meteo** | FREE | ♾️ | $0 | **$0** 🏆 Gratis |

**Conclusión:** WeatherAPI tiene el mejor costo/beneficio en planes pagos, Open-Meteo es imbatible para FREE.

---

## ❓ Troubleshooting

### "WeatherAPI requiere API key"
- Verifica que `WEATHERAPI_KEY` esté en las variables de entorno
- Reinicia el servidor después de agregar la variable

### "No se encontró la ubicación"
- Intenta con nombre de ciudad específico, no provincia/región
- Ejemplo: ✅ "Buenos Aires" en vez de ❌ "Chubut"

### Todos los providers fallan
- Verifica conectividad a internet
- Revisa los logs para más detalles
- Open-Meteo debería funcionar siempre (no requiere API key)
