#!/usr/bin/env bash
#
# Runs once, after the container is built.
#
# Anything that can go into the image belongs in the Dockerfile instead, where
# it becomes a cached layer rather than a download repeated for every new
# container. What is left here is the part that genuinely depends on the
# checked out source: installing the application's dependencies.

set -euo pipefail

if [ -f app/package.json ]; then
  echo "==> npm install"
  (cd app && npm install --no-audit --no-fund)
fi

echo "==> tools"
docker --version
kubectl version --client -o yaml | grep gitVersion | head -1
kind --version
trivy --version | head -1
