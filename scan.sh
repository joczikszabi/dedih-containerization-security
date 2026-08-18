#!/usr/bin/env bash
#
# Counts the CRITICAL and HIGH findings in an image.
#
# `trivy image` on its own prints several hundred lines and wraps unreadably in
# a terminal. The number is what block 3 compares, so this pulls just that out.
# To see the actual findings for one image, run trivy directly:
#
#   trivy image --severity CRITICAL,HIGH snake:v1

set -euo pipefail

if [ $# -eq 0 ]; then
  echo "usage: ./scan.sh <image> [image...]" >&2
  exit 1
fi

for image in "$@"; do
  count=$(trivy image --quiet --format json --severity CRITICAL,HIGH "$image" \
    | jq '[.Results[]?.Vulnerabilities // [] | length] | add // 0')
  printf '%-22s %s CRITICAL+HIGH\n' "$image" "$count"
done
