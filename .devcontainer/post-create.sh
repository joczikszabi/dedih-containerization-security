#!/usr/bin/env bash
#
# Runs once when the Codespace is created.
#
# kubectl and helm come from a devcontainer feature. kind and trivy have no official
# feature, so they are installed here as single static binaries. Both are small and
# this keeps the container definition free of third party feature registries.

set -euo pipefail

ARCH="$(dpkg --print-architecture)" # amd64 or arm64

KIND_VERSION="v0.30.0"
TRIVY_VERSION="0.74.0"

echo "==> installing kind ${KIND_VERSION} (${ARCH})"
curl -fsSL -o /tmp/kind "https://kind.sigs.k8s.io/dl/${KIND_VERSION}/kind-linux-${ARCH}"
sudo install -m 0755 /tmp/kind /usr/local/bin/kind
rm -f /tmp/kind

echo "==> installing trivy ${TRIVY_VERSION} (${ARCH})"
case "${ARCH}" in
  amd64) TRIVY_ARCH="Linux-64bit" ;;
  arm64) TRIVY_ARCH="Linux-ARM64" ;;
  *) echo "unsupported architecture ${ARCH}"; exit 1 ;;
esac
curl -fsSL -o /tmp/trivy.tar.gz \
  "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_${TRIVY_ARCH}.tar.gz"
tar -xzf /tmp/trivy.tar.gz -C /tmp trivy
sudo install -m 0755 /tmp/trivy /usr/local/bin/trivy
rm -f /tmp/trivy.tar.gz /tmp/trivy

# The application is only present once app/ has been added to the repository.
if [ -f app/package.json ]; then
  echo "==> npm install"
  (cd app && npm install --no-audit --no-fund)
fi

echo "==> versions"
docker --version
kubectl version --client --output=yaml | head -3
kind --version
trivy --version | head -1
