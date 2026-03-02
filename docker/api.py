"""
Social Media Downloader API
FastAPI service for downloading videos from multiple social media platforms
"""

import os
import asyncio
import logging
import hashlib
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any
from enum import Enum

from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl, validator, Field
import yt_dlp

# Configure logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Configuration
DOWNLOAD_DIR = Path(os.getenv("DOWNLOAD_DIR", "/tmp/downloads"))
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE", "500"))
CLEANUP_INTERVAL = int(os.getenv("CLEANUP_INTERVAL", "3600"))
FILE_RETENTION_HOURS = int(os.getenv("FILE_RETENTION_HOURS", "1"))

# Initialize FastAPI app
app = FastAPI(
    title="Social Media Downloader API",
    description="API for downloading videos from YouTube, TikTok, Instagram, Facebook, Twitter/X, and Vimeo",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enums
class Platform(str, Enum):
    AUTO = "auto"
    YOUTUBE = "youtube"
    TIKTOK = "tiktok"
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"
    TWITTER = "twitter"
    VIMEO = "vimeo"

class Format(str, Enum):
    MP4 = "mp4"
    MP3 = "mp3"

# Pydantic models
class DownloadRequest(BaseModel):
    url: HttpUrl
    format: Format = Field(default=Format.MP4, description="Output format: mp4 or mp3")
    platform: Platform = Field(default=Platform.AUTO, description="Platform type (auto-detect by default)")
    quality: Optional[str] = Field(default="best", description="Video quality (best, 720p, 480p, etc.)")

    @validator('url')
    def validate_url(cls, v):
        url_str = str(v)
        allowed_domains = [
            'youtube.com', 'youtu.be',
            'tiktok.com',
            'instagram.com',
            'facebook.com', 'fb.watch',
            'twitter.com', 'x.com',
            'vimeo.com'
        ]
        if not any(domain in url_str for domain in allowed_domains):
            raise ValueError(f"URL must be from supported platforms: {', '.join(allowed_domains)}")
        return v

class DownloadResponse(BaseModel):
    status: str
    message: str
    download_id: Optional[str] = None
    download_url: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    file_size_mb: Optional[float] = None

class HealthResponse(BaseModel):
    status: str
    timestamp: str
    version: str
    download_dir_exists: bool
    download_count: int

# Rate limiting (simple in-memory implementation)
request_counts: Dict[str, list] = {}
RATE_LIMIT_REQUESTS = 10
RATE_LIMIT_WINDOW = 60  # seconds

def check_rate_limit(client_ip: str) -> bool:
    """Check if client has exceeded rate limit"""
    now = time.time()
    if client_ip not in request_counts:
        request_counts[client_ip] = []
    
    # Remove old requests outside the window
    request_counts[client_ip] = [
        req_time for req_time in request_counts[client_ip]
        if now - req_time < RATE_LIMIT_WINDOW
    ]
    
    # Check limit
    if len(request_counts[client_ip]) >= RATE_LIMIT_REQUESTS:
        return False
    
    request_counts[client_ip].append(now)
    return True

def get_download_options(format_type: Format, quality: str) -> Dict[str, Any]:
    """Get yt-dlp download options based on format and quality"""
    base_options = {
        'quiet': False,
        'no_warnings': False,
        'extract_flat': False,
        'nocheckcertificate': True,
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }
    
    if format_type == Format.MP3:
        base_options.update({
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
        })
    else:  # MP4
        if quality == "best":
            base_options['format'] = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
        else:
            base_options['format'] = f'bestvideo[height<={quality.replace("p", "")}][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
    
    return base_options

async def download_video(url: str, format_type: Format, quality: str) -> Dict[str, Any]:
    """Download video using yt-dlp"""
    try:
        # Generate unique filename
        url_hash = hashlib.md5(f"{url}{time.time()}".encode()).hexdigest()[:12]
        output_template = str(DOWNLOAD_DIR / f"{url_hash}.%(ext)s")
        
        # Configure yt-dlp options
        ydl_opts = get_download_options(format_type, quality)
        ydl_opts['outtmpl'] = output_template
        
        # Download
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            logger.info(f"Starting download for URL: {url}")
            info = ydl.extract_info(url, download=True)
            
            # Get the actual downloaded file
            if format_type == Format.MP3:
                filename = f"{url_hash}.mp3"
            else:
                filename = f"{url_hash}.{info.get('ext', 'mp4')}"
            
            filepath = DOWNLOAD_DIR / filename
            
            # Verify file exists
            if not filepath.exists():
                # Try to find the file
                pattern = f"{url_hash}.*"
                files = list(DOWNLOAD_DIR.glob(pattern))
                if files:
                    filepath = files[0]
                    filename = filepath.name
                else:
                    raise FileNotFoundError("Downloaded file not found")
            
            # Check file size
            file_size_mb = filepath.stat().st_size / (1024 * 1024)
            if file_size_mb > MAX_FILE_SIZE_MB:
                filepath.unlink()
                raise ValueError(f"File size ({file_size_mb:.2f} MB) exceeds maximum allowed ({MAX_FILE_SIZE_MB} MB)")
            
            logger.info(f"Download completed: {filename} ({file_size_mb:.2f} MB)")
            
            # Extract metadata
            metadata = {
                'title': info.get('title', 'Unknown'),
                'duration': info.get('duration'),
                'uploader': info.get('uploader'),
                'upload_date': info.get('upload_date'),
                'view_count': info.get('view_count'),
                'like_count': info.get('like_count'),
                'description': info.get('description', '')[:200] + '...' if info.get('description') else None,
                'platform': info.get('extractor_key', 'Unknown'),
                'thumbnail': info.get('thumbnail'),
            }
            
            return {
                'success': True,
                'filename': filename,
                'filepath': str(filepath),
                'file_size_mb': round(file_size_mb, 2),
                'metadata': metadata
            }
            
    except yt_dlp.utils.DownloadError as e:
        logger.error(f"Download error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Download failed: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error during download: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")

async def cleanup_old_files():
    """Remove files older than FILE_RETENTION_HOURS"""
    try:
        now = time.time()
        retention_seconds = FILE_RETENTION_HOURS * 3600
        removed_count = 0
        
        for filepath in DOWNLOAD_DIR.iterdir():
            if filepath.is_file():
                file_age = now - filepath.stat().st_mtime
                if file_age > retention_seconds:
                    filepath.unlink()
                    removed_count += 1
                    logger.info(f"Cleaned up old file: {filepath.name}")
        
        if removed_count > 0:
            logger.info(f"Cleanup completed: {removed_count} files removed")
    except Exception as e:
        logger.error(f"Error during cleanup: {str(e)}")

# API Endpoints
@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    download_count = len(list(DOWNLOAD_DIR.glob("*"))) if DOWNLOAD_DIR.exists() else 0
    
    return HealthResponse(
        status="healthy",
        timestamp=datetime.utcnow().isoformat(),
        version="1.0.0",
        download_dir_exists=DOWNLOAD_DIR.exists(),
        download_count=download_count
    )

@app.post("/api/download", response_model=DownloadResponse)
async def download_media(
    request: DownloadRequest,
    background_tasks: BackgroundTasks,
    req: Request
):
    """
    Download media from supported platforms
    
    Supported platforms:
    - YouTube (youtube.com, youtu.be)
    - TikTok (tiktok.com)
    - Instagram (instagram.com)
    - Facebook (facebook.com, fb.watch)
    - Twitter/X (twitter.com, x.com)
    - Vimeo (vimeo.com)
    """
    # Rate limiting
    client_ip = req.client.host
    if not check_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Maximum {RATE_LIMIT_REQUESTS} requests per {RATE_LIMIT_WINDOW} seconds"
        )
    
    try:
        # Download the video
        result = await download_video(
            str(request.url),
            request.format,
            request.quality
        )
        
        # Schedule cleanup
        background_tasks.add_task(cleanup_old_files)
        
        # Build download URL
        download_url = f"/api/file/{result['filename']}"
        
        return DownloadResponse(
            status="success",
            message="Download completed successfully",
            download_id=result['filename'].split('.')[0],
            download_url=download_url,
            metadata=result['metadata'],
            file_size_mb=result['file_size_mb']
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing download request: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/file/{filename}")
async def get_file(filename: str, background_tasks: BackgroundTasks):
    """Download the requested file"""
    # Validate filename (security check)
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    filepath = DOWNLOAD_DIR / filename
    
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Schedule file deletion after download
    async def delete_file():
        await asyncio.sleep(60)  # Wait a bit before deleting
        try:
            if filepath.exists():
                filepath.unlink()
                logger.info(f"Deleted file after download: {filename}")
        except Exception as e:
            logger.error(f"Error deleting file: {str(e)}")
    
    background_tasks.add_task(delete_file)
    
    return FileResponse(
        path=filepath,
        filename=filename,
        media_type="application/octet-stream"
    )

@app.get("/api/platforms")
async def get_supported_platforms():
    """Get list of supported platforms"""
    return {
        "platforms": [
            {
                "name": "YouTube",
                "domains": ["youtube.com", "youtu.be"],
                "supports_mp4": True,
                "supports_mp3": True,
                "example_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
            },
            {
                "name": "TikTok",
                "domains": ["tiktok.com"],
                "supports_mp4": True,
                "supports_mp3": True,
                "example_url": "https://www.tiktok.com/@user/video/123456789"
            },
            {
                "name": "Instagram",
                "domains": ["instagram.com"],
                "supports_mp4": True,
                "supports_mp3": True,
                "example_url": "https://www.instagram.com/p/ABC123/"
            },
            {
                "name": "Facebook",
                "domains": ["facebook.com", "fb.watch"],
                "supports_mp4": True,
                "supports_mp3": True,
                "example_url": "https://www.facebook.com/watch/?v=123456789"
            },
            {
                "name": "Twitter/X",
                "domains": ["twitter.com", "x.com"],
                "supports_mp4": True,
                "supports_mp3": True,
                "example_url": "https://twitter.com/user/status/123456789"
            },
            {
                "name": "Vimeo",
                "domains": ["vimeo.com"],
                "supports_mp4": True,
                "supports_mp3": True,
                "example_url": "https://vimeo.com/123456789"
            }
        ]
    }

@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "service": "Social Media Downloader API",
        "version": "1.0.0",
        "documentation": "/api/docs",
        "health": "/api/health",
        "endpoints": {
            "download": "POST /api/download",
            "platforms": "GET /api/platforms",
            "file": "GET /api/file/{filename}"
        }
    }

# Exception handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "message": exc.detail,
            "timestamp": datetime.utcnow().isoformat()
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "message": "Internal server error",
            "timestamp": datetime.utcnow().isoformat()
        }
    )

# Startup and shutdown events
@app.on_event("startup")
async def startup_event():
    logger.info("Starting Social Media Downloader API")
    logger.info(f"Download directory: {DOWNLOAD_DIR}")
    logger.info(f"Max file size: {MAX_FILE_SIZE_MB} MB")
    logger.info(f"File retention: {FILE_RETENTION_HOURS} hours")
    
    # Initial cleanup
    await cleanup_old_files()

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down Social Media Downloader API")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
