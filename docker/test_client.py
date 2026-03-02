#!/usr/bin/env python3
"""
Social Media Downloader API - Test Client
Simple script to test the API with various platforms
"""

import requests
import json
import sys
from typing import Optional

class Colors:
    """Terminal colors"""
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    END = '\033[0m'
    BOLD = '\033[1m'

class SMDClient:
    """Simple client for Social Media Downloader API"""
    
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.session = requests.Session()
    
    def health_check(self) -> dict:
        """Check API health"""
        try:
            response = self.session.get(f"{self.base_url}/api/health")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    def get_platforms(self) -> dict:
        """Get supported platforms"""
        try:
            response = self.session.get(f"{self.base_url}/api/platforms")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    def download(self, url: str, format: str = "mp4", quality: str = "best") -> dict:
        """Download media from URL"""
        try:
            response = self.session.post(
                f"{self.base_url}/api/download",
                json={
                    "url": url,
                    "format": format,
                    "quality": quality
                },
                timeout=120
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            try:
                error_detail = e.response.json()
                return {"status": "error", "message": error_detail.get("message", str(e))}
            except:
                return {"status": "error", "message": str(e)}
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    def download_file(self, download_url: str, output_path: str) -> bool:
        """Download the actual file"""
        try:
            response = self.session.get(f"{self.base_url}{download_url}", stream=True)
            response.raise_for_status()
            
            with open(output_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            return True
        except Exception as e:
            print(f"{Colors.RED}Error downloading file: {e}{Colors.END}")
            return False

def print_header(text: str):
    """Print colored header"""
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}{text:^60}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.END}\n")

def print_success(text: str):
    """Print success message"""
    print(f"{Colors.GREEN}✓ {text}{Colors.END}")

def print_error(text: str):
    """Print error message"""
    print(f"{Colors.RED}✗ {text}{Colors.END}")

def print_info(text: str):
    """Print info message"""
    print(f"{Colors.CYAN}ℹ {text}{Colors.END}")

def test_health(client: SMDClient):
    """Test health endpoint"""
    print_header("Health Check")
    result = client.health_check()
    
    if result.get("status") == "healthy":
        print_success(f"API is healthy (v{result.get('version')})")
        print_info(f"Download directory exists: {result.get('download_dir_exists')}")
        print_info(f"Files in download directory: {result.get('download_count')}")
    else:
        print_error(f"API health check failed: {result.get('message')}")
        return False
    
    return True

def test_platforms(client: SMDClient):
    """Test platforms endpoint"""
    print_header("Supported Platforms")
    result = client.get_platforms()
    
    if "platforms" in result:
        for platform in result["platforms"]:
            print(f"\n{Colors.BOLD}{platform['name']}{Colors.END}")
            print(f"  Domains: {', '.join(platform['domains'])}")
            print(f"  MP4: {'✓' if platform['supports_mp4'] else '✗'} | MP3: {'✓' if platform['supports_mp3'] else '✗'}")
    else:
        print_error("Failed to get platforms")
        return False
    
    return True

def test_download(client: SMDClient, url: str, format: str = "mp4"):
    """Test download endpoint"""
    print_header(f"Testing Download - {format.upper()}")
    print_info(f"URL: {url}")
    print_info(f"Format: {format}")
    print_info("Downloading... (this may take a while)")
    
    result = client.download(url, format=format, quality="480p")
    
    if result.get("status") == "success":
        print_success("Download completed!")
        print(f"\n{Colors.BOLD}Metadata:{Colors.END}")
        metadata = result.get("metadata", {})
        print(f"  Title: {metadata.get('title', 'N/A')}")
        print(f"  Platform: {metadata.get('platform', 'N/A')}")
        print(f"  Duration: {metadata.get('duration', 'N/A')} seconds")
        print(f"  Uploader: {metadata.get('uploader', 'N/A')}")
        print(f"  Views: {metadata.get('view_count', 'N/A'):,}" if metadata.get('view_count') else "")
        print(f"  File Size: {result.get('file_size_mb', 'N/A')} MB")
        print(f"\n{Colors.BOLD}Download URL:{Colors.END} {result.get('download_url')}")
        
        return True, result.get('download_url')
    else:
        print_error(f"Download failed: {result.get('message')}")
        return False, None

def main():
    """Main function"""
    print(f"{Colors.BOLD}{Colors.HEADER}")
    print("╔════════════════════════════════════════════════════════════╗")
    print("║     Social Media Downloader API - Test Client             ║")
    print("╚════════════════════════════════════════════════════════════╝")
    print(f"{Colors.END}")
    
    # Initialize client
    client = SMDClient()
    
    # Test 1: Health Check
    if not test_health(client):
        print_error("\nAPI is not available. Make sure it's running:")
        print_info("  docker-compose up -d")
        sys.exit(1)
    
    # Test 2: Platforms
    test_platforms(client)
    
    # Test 3: Download examples
    test_cases = [
        ("https://www.youtube.com/watch?v=jNQXAC9IVRw", "mp4", "YouTube Short Video"),
        # Uncomment to test other platforms:
        # ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "mp3", "YouTube Audio"),
        # ("https://www.tiktok.com/@username/video/1234567890", "mp4", "TikTok Video"),
        # ("https://www.instagram.com/reel/ABC123/", "mp4", "Instagram Reel"),
    ]
    
    for url, format, description in test_cases:
        print(f"\n{Colors.YELLOW}Testing: {description}{Colors.END}")
        success, download_url = test_download(client, url, format)
        
        if success and download_url:
            # Optionally download the file
            response = input(f"\n{Colors.CYAN}Download the file to disk? (y/N): {Colors.END}")
            if response.lower() == 'y':
                filename = f"test_video.{format}"
                print_info(f"Downloading to {filename}...")
                if client.download_file(download_url, filename):
                    print_success(f"File saved as {filename}")
                else:
                    print_error("Failed to download file")
    
    print_header("Tests Completed")
    print_success("All tests completed successfully!")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n\n{Colors.YELLOW}Test interrupted by user{Colors.END}")
        sys.exit(0)
    except Exception as e:
        print(f"\n{Colors.RED}Unexpected error: {e}{Colors.END}")
        sys.exit(1)
