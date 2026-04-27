#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "=== Deploying EtymoGraph to k3s ==="

# Create secrets.yaml from example if not exists
if [ ! -f base/secrets.yaml ]; then
    if [ -f base/secrets.yaml.example ]; then
        echo "Creating base/secrets.yaml from example..."
        cp base/secrets.yaml.example base/secrets.yaml
        echo "IMPORTANT: Edit base/secrets.yaml with your actual secrets!"
    else
        echo "ERROR: base/secrets.yaml.example not found!"
        exit 1
    fi
fi

# Check if secrets are configured
if grep -q "CHANGE_ME" base/secrets.yaml; then
    echo ""
    echo "WARNING: You need to update secrets before deploying!"
    echo "Edit k8s/base/secrets.yaml and replace:"
    echo "  - CHANGE_ME_POSTGRES_PASSWORD"
    echo "  - CHANGE_ME_GEMINI_API_KEY"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Apply with kustomize
echo "[1/2] Applying manifests..."
kubectl apply -k .

echo ""
echo "[2/2] Waiting for pods..."
kubectl -n etymograph wait --for=condition=ready pod -l app=postgres --timeout=120s || true
kubectl -n etymograph wait --for=condition=ready pod -l app=redis --timeout=60s || true
kubectl -n etymograph wait --for=condition=ready pod -l app=api --timeout=120s || true
kubectl -n etymograph wait --for=condition=ready pod -l app=frontend --timeout=120s || true

echo ""
echo "=== Deployment complete! ==="
echo ""
kubectl -n etymograph get pods
echo ""
echo "Check your ingress for access URL:"
echo "  kubectl -n etymograph get ingress"
