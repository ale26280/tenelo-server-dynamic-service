#!/bin/bash

# Social Media Downloader API - Helper Script
# Facilita el uso del servicio Docker

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}  Social Media Downloader API${NC}"
    echo -e "${BLUE}================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Commands
build() {
    print_header
    print_info "Building Docker image..."
    docker-compose build
    print_success "Build completed!"
}

start() {
    print_header
    print_info "Starting service..."
    docker-compose up -d
    sleep 3
    print_success "Service started!"
    print_info "API available at: http://localhost:8000"
    print_info "Documentation: http://localhost:8000/api/docs"
}

stop() {
    print_header
    print_info "Stopping service..."
    docker-compose down
    print_success "Service stopped!"
}

restart() {
    stop
    start
}

logs() {
    print_header
    docker-compose logs -f smd-api
}

status() {
    print_header
    print_info "Service status:"
    docker-compose ps
    echo ""
    print_info "Health check:"
    curl -s http://localhost:8000/api/health 2>/dev/null | python3 -m json.tool || print_error "Service not responding"
}

test() {
    print_header
    print_info "Testing API with YouTube video..."
    
    RESPONSE=$(curl -s -X POST http://localhost:8000/api/download \
        -H "Content-Type: application/json" \
        -d '{
            "url": "https://www.youtube.com/watch?v=jNQXAC9IVRw",
            "format": "mp4",
            "quality": "480p"
        }')
    
    echo "$RESPONSE" | python3 -m json.tool
    
    STATUS=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('status', 'error'))")
    
    if [ "$STATUS" = "success" ]; then
        print_success "Test passed!"
    else
        print_error "Test failed!"
    fi
}

clean() {
    print_header
    print_info "Cleaning downloaded files..."
    docker-compose exec smd-api sh -c "rm -rf /tmp/downloads/*"
    print_success "Cleanup completed!"
}

rebuild() {
    print_header
    print_info "Rebuilding from scratch..."
    docker-compose down
    docker-compose build --no-cache
    docker-compose up -d
    print_success "Rebuild completed!"
}

usage() {
    print_header
    echo "Usage: $0 {build|start|stop|restart|logs|status|test|clean|rebuild}"
    echo ""
    echo "Commands:"
    echo "  build     - Build Docker image"
    echo "  start     - Start the service"
    echo "  stop      - Stop the service"
    echo "  restart   - Restart the service"
    echo "  logs      - Show service logs (follow mode)"
    echo "  status    - Show service status and health"
    echo "  test      - Run a test download"
    echo "  clean     - Clean downloaded files"
    echo "  rebuild   - Rebuild from scratch (no cache)"
    echo ""
    echo "Examples:"
    echo "  $0 build && $0 start"
    echo "  $0 logs"
    echo "  $0 test"
}

# Main
case "${1}" in
    build)
        build
        ;;
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    logs)
        logs
        ;;
    status)
        status
        ;;
    test)
        test
        ;;
    clean)
        clean
        ;;
    rebuild)
        rebuild
        ;;
    *)
        usage
        exit 1
        ;;
esac

exit 0
