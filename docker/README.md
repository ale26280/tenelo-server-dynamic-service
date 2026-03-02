# 🎬 Social Media Downloader API

API REST profesional para descargar videos de múltiples plataformas de redes sociales usando FastAPI y yt-dlp.

## 📋 Características

- ✅ Soporte para **6 plataformas principales**: YouTube, TikTok, Instagram, Facebook, Twitter/X, Vimeo
- 🎵 Formatos de salida: **MP4** (video) y **MP3** (audio)
- 🔒 **Seguridad**: Rate limiting, validación de URLs, ejecución como usuario no-root
- 📊 **Monitoreo**: Health checks, logging estructurado, métricas
- 🧹 **Auto-limpieza**: Eliminación automática de archivos antiguos
- 🚀 **Alto rendimiento**: Multi-worker, async/await, optimización de recursos
- 📚 **Documentación automática**: Swagger UI y ReDoc integrados

## 🔧 Requisitos Previos

- Docker >= 20.10
- Docker Compose >= 2.0
- Mínimo 2GB RAM disponible
- Mínimo 5GB espacio en disco

## 🚀 Instalación y Ejecución

### 1. Build de la imagen

```bash
cd docker
docker-compose build
```

**Tiempo estimado**: 5-10 minutos (primera vez)

### 2. Levantar el servicio

```bash
docker-compose up -d
```

### 3. Verificar estado

```bash
docker-compose ps
docker-compose logs -f smd-api
```

### 4. Detener el servicio

```bash
docker-compose down
```

## 📡 Endpoints de la API

### Base URL
```
http://localhost:8000
```

### Documentación Interactiva
- **Swagger UI**: http://localhost:8000/api/docs
- **ReDoc**: http://localhost:8000/api/redoc

### Endpoints Disponibles

#### 1. Health Check
```http
GET /api/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-03-01T12:00:00.000000",
  "version": "1.0.0",
  "download_dir_exists": true,
  "download_count": 3
}
```

#### 2. Download Media
```http
POST /api/download
Content-Type: application/json

{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "format": "mp4",
  "platform": "auto",
  "quality": "best"
}
```

**Parámetros:**
- `url` (string, requerido): URL del video
- `format` (string, opcional): `mp4` o `mp3` (default: `mp4`)
- `platform` (string, opcional): `auto`, `youtube`, `tiktok`, `instagram`, `facebook`, `twitter`, `vimeo` (default: `auto`)
- `quality` (string, opcional): `best`, `720p`, `480p`, etc. (default: `best`)

**Response exitoso:**
```json
{
  "status": "success",
  "message": "Download completed successfully",
  "download_id": "a1b2c3d4e5f6",
  "download_url": "/api/file/a1b2c3d4e5f6.mp4",
  "metadata": {
    "title": "Never Gonna Give You Up",
    "duration": 213,
    "uploader": "Rick Astley",
    "upload_date": "20091025",
    "view_count": 1234567890,
    "platform": "Youtube"
  },
  "file_size_mb": 8.5
}
```

**Response de error:**
```json
{
  "status": "error",
  "message": "Download failed: Video not available",
  "timestamp": "2026-03-01T12:00:00.000000"
}
```

#### 3. Descargar Archivo
```http
GET /api/file/{filename}
```

Descarga el archivo directamente. El archivo se elimina automáticamente después de 60 segundos.

#### 4. Plataformas Soportadas
```http
GET /api/platforms
```

**Response:**
```json
{
  "platforms": [
    {
      "name": "YouTube",
      "domains": ["youtube.com", "youtu.be"],
      "supports_mp4": true,
      "supports_mp3": true,
      "example_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    },
    ...
  ]
}
```

## 💻 Ejemplos de Uso

### cURL

#### Descargar video de YouTube (MP4)
```bash
curl -X POST http://localhost:8000/api/download \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "format": "mp4",
    "quality": "720p"
  }'
```

#### Descargar audio de YouTube (MP3)
```bash
curl -X POST http://localhost:8000/api/download \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "format": "mp3"
  }'
```

#### Descargar video de TikTok
```bash
curl -X POST http://localhost:8000/api/download \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.tiktok.com/@user/video/1234567890",
    "format": "mp4"
  }'
```

#### Descargar Reel de Instagram
```bash
curl -X POST http://localhost:8000/api/download \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.instagram.com/reel/ABC123/",
    "format": "mp4"
  }'
```

#### Descargar video de Facebook
```bash
curl -X POST http://localhost:8000/api/download \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.facebook.com/watch/?v=123456789",
    "format": "mp4"
  }'
```

#### Descargar video de Twitter/X
```bash
curl -X POST http://localhost:8000/api/download \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://twitter.com/user/status/1234567890",
    "format": "mp4"
  }'
```

#### Descargar video de Vimeo
```bash
curl -X POST http://localhost:8000/api/download \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://vimeo.com/123456789",
    "format": "mp4"
  }'
```

### Python

```python
import requests

# Descargar video
response = requests.post(
    "http://localhost:8000/api/download",
    json={
        "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "format": "mp4",
        "quality": "720p"
    }
)

result = response.json()
print(f"Status: {result['status']}")
print(f"Title: {result['metadata']['title']}")
print(f"Download URL: {result['download_url']}")

# Descargar el archivo
if result['status'] == 'success':
    file_response = requests.get(
        f"http://localhost:8000{result['download_url']}"
    )
    
    with open('video.mp4', 'wb') as f:
        f.write(file_response.content)
    
    print("Video descargado exitosamente!")
```

### JavaScript/Node.js

```javascript
const axios = require('axios');
const fs = require('fs');

async function downloadVideo() {
  try {
    // Solicitar descarga
    const response = await axios.post('http://localhost:8000/api/download', {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      format: 'mp4',
      quality: '720p'
    });

    const result = response.data;
    console.log(`Status: ${result.status}`);
    console.log(`Title: ${result.metadata.title}`);

    // Descargar archivo
    if (result.status === 'success') {
      const fileResponse = await axios.get(
        `http://localhost:8000${result.download_url}`,
        { responseType: 'stream' }
      );

      const writer = fs.createWriteStream('video.mp4');
      fileResponse.data.pipe(writer);

      writer.on('finish', () => {
        console.log('Video descargado exitosamente!');
      });
    }
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

downloadVideo();
```

## ⚙️ Configuración

Variables de entorno disponibles en `docker-compose.yml`:

| Variable | Descripción | Default | Valores |
|----------|-------------|---------|---------|
| `LOG_LEVEL` | Nivel de logging | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `DOWNLOAD_DIR` | Directorio de descargas | `/tmp/downloads` | Ruta absoluta |
| `MAX_FILE_SIZE` | Tamaño máximo de archivo (MB) | `500` | Número entero |
| `FILE_RETENTION_HOURS` | Tiempo de retención de archivos | `1` | Número entero |
| `CLEANUP_INTERVAL` | Intervalo de limpieza (segundos) | `3600` | Número entero |
| `WORKERS` | Número de workers | `2` | 1-4 |

## 🔒 Seguridad

- ✅ Ejecución como usuario no-root
- ✅ Rate limiting: 10 requests/minuto por IP
- ✅ Validación estricta de URLs
- ✅ Sanitización de nombres de archivo
- ✅ Límites de tamaño de archivo
- ✅ Auto-eliminación de archivos temporales
- ✅ CORS configurado

## 📊 Monitoreo y Logs

### Ver logs en tiempo real
```bash
docker-compose logs -f smd-api
```

### Ver logs de las últimas 100 líneas
```bash
docker-compose logs --tail=100 smd-api
```

### Verificar health status
```bash
curl http://localhost:8000/api/health
```

## 🐛 Troubleshooting

### El contenedor no inicia
```bash
# Ver logs detallados
docker-compose logs smd-api

# Verificar recursos
docker stats
```

### Error "FFmpeg not found"
El Dockerfile ya incluye ffmpeg. Si persiste el error:
```bash
# Rebuild sin cache
docker-compose build --no-cache
```

### Error "Download failed"
- Verifica que la URL sea pública y accesible
- Algunos videos pueden tener restricciones geográficas
- Verifica los logs para detalles específicos

### El archivo descargado no se encuentra
Los archivos se eliminan automáticamente después de:
- 60 segundos después de la descarga
- 1 hora de inactividad (configurable)

### Rate limit excedido
```json
{
  "status": "error",
  "message": "Rate limit exceeded. Maximum 10 requests per 60 seconds"
}
```
Espera 60 segundos antes de hacer más requests.

## 📈 Limitaciones

- Tamaño máximo de archivo: 500 MB (configurable)
- Rate limit: 10 requests/minuto por IP
- Solo videos públicos (no soporta autenticación)
- Instagram Stories no soportado
- Contenido privado/protegido no soportado

## 🆘 Soporte de Plataformas

| Plataforma | MP4 | MP3 | Notas |
|------------|-----|-----|-------|
| YouTube | ✅ | ✅ | Videos públicos y Shorts |
| TikTok | ✅ | ✅ | Solo videos públicos |
| Instagram | ✅ | ✅ | Reels, Posts, IGTV (no Stories) |
| Facebook | ✅ | ✅ | Solo videos públicos |
| Twitter/X | ✅ | ✅ | Solo videos públicos |
| Vimeo | ✅ | ✅ | Solo videos públicos |

## 📝 Licencia

Este proyecto usa las siguientes herramientas open source:
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - Descargador de videos
- [FFmpeg](https://ffmpeg.org/) - Procesamiento multimedia
- [FastAPI](https://fastapi.tiangolo.com/) - Framework web

## 🤝 Contribuir

Para mejoras o reportar issues, contacta al equipo de desarrollo de Tenelo.

---

**Desarrollado con ❤️ por Tenelo Development Team**
