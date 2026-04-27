#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "=== Tearing down EtymoGraph ==="

read -p "This will delete all resources. Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

kubectl delete -k . || true

echo ""
echo "=== Teardown complete ==="
