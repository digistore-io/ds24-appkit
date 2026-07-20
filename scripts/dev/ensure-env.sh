#!/usr/bin/env bash
# Sorgt dafür, dass eine brauchbare .env existiert:
#   1. fehlt sie, wird sie aus .env.example angelegt,
#   2. ein leeres AUTH_SECRET wird mit einem Zufallswert gefüllt.
#
# Warum Punkt 2: Ohne AUTH_SECRET wirft Auth.js bei jedem Login-Versuch
# "MissingSecret" — aber nur ins Log. Die Seiten sehen normal aus, und der
# Fehler fällt erst auf, wenn der Login nicht funktioniert. Ein lokal erzeugtes
# Geheimnis kostet nichts und erspart genau diese Sackgasse.
#
# In Produktion wird AUTH_SECRET NICHT hier gesetzt, sondern in der
# Secret-Verwaltung des Hosters (siehe docs/DEPLOY.md).
set -euo pipefail

ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
  if [ ! -f .env.example ]; then
    echo "FEHLER: weder .env noch .env.example vorhanden." >&2
    exit 1
  fi
  cp .env.example "$ENV_FILE"
  echo "→ .env aus .env.example angelegt."
fi

# Zufälliges Geheimnis erzeugen — openssl, sonst node.
zufall() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  fi
}

# Nur füllen, wenn die Zeile fehlt oder leer ist — nie einen gesetzten Wert überschreiben.
if grep -qE '^AUTH_SECRET=.+' "$ENV_FILE"; then
  exit 0
fi

secret="$(zufall)"
if grep -qE '^#?\s*AUTH_SECRET=' "$ENV_FILE"; then
  # Portabel (BSD/GNU sed unterscheiden sich bei -i): über eine temporäre Datei.
  tmp="$(mktemp)"
  sed "s|^#\{0,1\}[[:space:]]*AUTH_SECRET=.*|AUTH_SECRET=$secret|" "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
else
  printf '\nAUTH_SECRET=%s\n' "$secret" >> "$ENV_FILE"
fi
echo "→ AUTH_SECRET in .env erzeugt (lokales Entwicklungs-Geheimnis)."
