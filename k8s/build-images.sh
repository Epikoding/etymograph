#!/bin/bash
set -e

# Build Docker images for k3s
# Run this script from the project root directory

cd "$(dirname "$0")/.."

echo "=== Building Docker images for k3s ==="

# Build images
echo "[1/4] Building api..."
docker build -t etymograph/api:latest ./api-go

echo "[2/4] Building frontend..."
docker build -t etymograph/frontend:latest ./frontend

echo "[3/4] Building llm-proxy..."
docker build -t etymograph/llm-proxy:latest ./llm-proxy

echo "[4/4] Building rate-limiter..."
docker build -t etymograph/rate-limiter:latest ./rate-limiter

echo ""
echo "=== Importing images to k3s ==="

# Export and import to k3s containerd
for img in api frontend llm-proxy rate-limiter; do
    echo "Importing etymograph/${img}:latest to k3s..."
    docker save etymograph/${img}:latest | sudo k3s ctr images import -
done

echo ""
echo "=== Done! ==="
echo "Verify images with: sudo k3s ctr images list | grep etymograph"
