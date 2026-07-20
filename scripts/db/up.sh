#!/usr/bin/env bash
# Startet die lokale Postgres (docker compose) — mit Sicherheitsnetz.
#
# Warum das Skript existiert: Ist der Datenbank-Port schon von einem ANDEREN
# Projekt belegt, zeigt Docker nur eine kryptische Meldung — und im schlimmsten
# Fall zeigt `DATABASE_URL=…localhost:5432…` danach auf die fremde Datenbank.
# Dann würden Migrationen dort landen. Das prüfen wir hier vorher ab.
#
# Aufruf:  bash scripts/db/up.sh   (oder: make db-up)
set -euo pipefail

# DB_PORT aus der Umgebung oder aus .env; Default 5432 (wie docker-compose.yml).
db_port="${DB_PORT:-}"
if [ -z "$db_port" ] && [ -f .env ]; then
  db_port="$(sed -n 's/^[[:space:]]*DB_PORT=//p' .env | tail -1 | tr -d '"'"'"' \r')"
fi
db_port="${db_port:-5432}"

hint_port_belegt() {
  cat <<EOF

  So löst du es: trag in .env einen freien Port ein — und zieh den Port in
  DATABASE_URL mit (beide müssen zusammenpassen!):

     DB_PORT=5433
     DATABASE_URL=postgresql://app:app@localhost:5433/app

  Danach nochmal: make start
EOF
}

# 1) Läuft unser eigener Container schon? Dann ist eine Belegung des Ports in
#    Ordnung — sie kommt von uns selbst.
ours="$(docker compose ps -q db 2>/dev/null || true)"

# 2) Fremdbelegung erkennen, BEVOR docker es tut. Sonst starten wir womöglich
#    einen Container ohne veröffentlichten Port und reden danach mit der
#    fremden Datenbank.
if [ -z "$ours" ] && command -v lsof >/dev/null 2>&1; then
  if lsof -ti "tcp:$db_port" >/dev/null 2>&1; then
    echo "✗ Auf Port $db_port läuft bereits eine andere Datenbank (anderes Projekt"
    echo "  oder eine lokal installierte Postgres)."
    echo "  Diese App würde sonst versehentlich mit DIESER fremden Datenbank"
    echo "  arbeiten — deshalb Abbruch."
    hint_port_belegt
    exit 1
  fi
fi

# 3) Starten und auf den Healthcheck warten.
if ! docker compose up -d --wait; then
  echo ""
  echo "✗ Postgres konnte nicht starten."
  echo "  Häufigster Grund: Port $db_port ist belegt."
  hint_port_belegt
  echo "  Läuft Docker überhaupt? Prüfen mit: docker ps"
  exit 1
fi

# 4) Gegenprobe: Ist der Port wirklich nach außen veröffentlicht, und ist es der
#    Port, den DATABASE_URL benutzt? Wenn nicht, zeigt DATABASE_URL ins Leere
#    oder — schlimmer — auf eine fremde Datenbank.
published="$(docker compose port db 5432 2>/dev/null || true)"
if [ -z "$published" ]; then
  echo "✗ Der Datenbank-Container läuft, veröffentlicht aber keinen Port."
  echo "  Das passiert nach einem abgebrochenen Start. Einmal neu aufsetzen:"
  echo "     docker compose down && make start"
  exit 1
fi
actual_port="${published##*:}"
if [ "$actual_port" != "$db_port" ]; then
  echo "✗ Der Container hört auf Port $actual_port, erwartet war $db_port."
  echo "  DB_PORT in .env und der laufende Container passen nicht zusammen:"
  echo "     docker compose down && make start"
  exit 1
fi

# 5) Zeigt DATABASE_URL auf denselben Port? Sonst arbeitet die App gegen eine
#    andere Datenbank als die, die wir hier gerade gestartet haben.
url="${DATABASE_URL:-}"
if [ -z "$url" ] && [ -f .env ]; then
  url="$(sed -n 's/^[[:space:]]*DATABASE_URL=//p' .env | tail -1 | tr -d '"'"'"' \r')"
fi
if [ -n "$url" ]; then
  url_port="$(printf '%s' "$url" | sed -n 's|.*://[^/]*:\([0-9]\{1,\}\)/.*|\1|p')"
  url_port="${url_port:-5432}"
  if [ "$url_port" != "$actual_port" ]; then
    echo "✗ DATABASE_URL benutzt Port $url_port, die lokale Datenbank läuft aber"
    echo "  auf Port $actual_port. So würde die App gegen eine FREMDE Datenbank"
    echo "  arbeiten (oder gar keine finden)."
    echo ""
    echo "  In .env angleichen:"
    echo "     DB_PORT=$actual_port"
    echo "     DATABASE_URL=postgresql://app:app@localhost:$actual_port/app"
    exit 1
  fi
fi
