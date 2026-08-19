# The image this dev container is built from. Not Codespaces specific: the same
# definition runs under VS Code, the devcontainer CLI and JetBrains.

FROM mcr.microsoft.com/devcontainers/javascript-node:22-bookworm

# Pinned rather than "latest", so everyone in the room gets the same versions
# regardless of when they opened their Codespace.
ARG KIND_VERSION=v0.30.0
ARG TRIVY_VERSION=0.74.0

# kind runs a Kubernetes cluster inside Docker. Used from block 4.
RUN ARCH="$(dpkg --print-architecture)" \
    && curl -fsSL -o /tmp/kind "https://kind.sigs.k8s.io/dl/${KIND_VERSION}/kind-linux-${ARCH}" \
    && install -m 0755 /tmp/kind /usr/local/bin/kind \
    && rm -f /tmp/kind

# trivy scans images for known vulnerabilities. Used in block 3.
RUN ARCH="$(dpkg --print-architecture)" \
    && case "${ARCH}" in \
         amd64) TRIVY_ARCH=Linux-64bit ;; \
         arm64) TRIVY_ARCH=Linux-ARM64 ;; \
         *) echo "unsupported architecture ${ARCH}" && exit 1 ;; \
       esac \
    && curl -fsSL -o /tmp/trivy.tar.gz \
       "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_${TRIVY_ARCH}.tar.gz" \
    && tar -xzf /tmp/trivy.tar.gz -C /tmp trivy \
    && install -m 0755 /tmp/trivy /usr/local/bin/trivy \
    && rm -f /tmp/trivy.tar.gz /tmp/trivy

# kubectl and helm come from a devcontainer feature instead, see
# devcontainer.json. Features are prebuilt install scripts maintained by
# someone else, and they are the other common way to add tools here.
