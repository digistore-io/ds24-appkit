#!/usr/bin/env bash
# Lokale Digistore24-IPNs empfangen — via kostenlosem Cloudflare Quick Tunnel.
#
# Legt einen temporären, öffentlichen HTTPS-Endpunkt auf deinen lokalen Dev-Server
# (Default http://localhost:3000). KEIN Cloudflare-Account, keine Domain, keine
# Kosten. Die URL wechselt bei jedem Start.
#
# Danach die angezeigte URL als IPN-Ziel in Digistore24 setzen (bzw. per Skript):
#   node scripts/ds24/ipn-setup.mjs \
#        --url "https://<zufall>.trycloudflare.com/api/ipn/<vendor>" \
#        --saas "Deine App" --env dev --apply
#
# Nutzung:  bash scripts/dev/tunnel.sh [PORT]
set -euo pipefail

PORT="${1:-3000}"
TARGET="http://localhost:${PORT}"

if ! command -v cloudflared >/dev/null 2>&1; then
  cat >&2 <<'EOF'
cloudflared ist nicht installiert. Installation (einmalig):

  macOS:         brew install cloudflared
  Linux (deb):   https://pkg.cloudflare.com/  (cloudflared-Paket)
  Windows:       winget install --id Cloudflare.cloudflared
  Direkt-Binary: https://github.com/cloudflare/cloudflared/releases

Danach dieses Skript erneut ausführen.
EOF
  exit 1
fi

echo ">> Cloudflare Quick Tunnel auf ${TARGET}"
echo ">> Die 'https://<...>.trycloudflare.com'-URL unten als IPN-Ziel in Digistore24 eintragen."
echo ">> (App muss laufen: npm run dev)"
echo
exec cloudflared tunnel --url "${TARGET}"
