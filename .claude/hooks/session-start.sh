#!/usr/bin/env bash
# Begrüßung beim Start von Claude Code in diesem Projekt.
#
# Läuft als SessionStart-Hook (siehe .claude/settings.json). Was hier auf stdout
# landet, sieht der Nutzer im Terminal — und Claude bekommt es als Kontext.
# Deshalb: kurz halten, konkret sagen, was als Nächstes zu tun ist.
#
# Hinweis: Beim ersten Öffnen eines frisch geklonten Projekts fragt Claude Code,
# ob es dem Projektordner vertrauen soll. Erst danach läuft dieser Hook.
set -euo pipefail

# Zustand erkennen, damit die Meldung zum jeweiligen Schritt passt.
has_env=false;   [ -f .env ] && has_env=true
has_brief=false; [ -f docs/product-brief.md ] && has_brief=true
# Ist schon eine eigene App gebaut worden? Grober, aber verlässlicher Indikator:
# eigene Seiten unterhalb von app/dashboard/ jenseits der mitgelieferten.
# (|| true: grep ohne Treffer liefert Exit 1 und würde mit set -e abbrechen.)
custom_pages=$( { find app/dashboard -mindepth 1 -maxdepth 1 -type d 2>/dev/null \
  | grep -v -E '/(admin|tarife|abo)$' || true; } | wc -l | tr -d ' ')

echo "──────────────────────────────────────────────────────────────────"
echo "Digistore SAAS Template — hier baust du deine eigene SAAS-App,"
echo "die über Digistore24 abrechnet."
echo ""

if [ "$custom_pages" -gt 0 ] || [ "$has_brief" = true ]; then
  # Laufendes Projekt — nicht mit Anfänger-Text belästigen.
  echo "Woran willst du weiterarbeiten?"
  echo "Der Weg: Bauen → Bezahlung → Sicherheit → Recht → Live → Vermarktung."
  echo "Sag z. B. \"weiter mit der App\" oder \"richte die Bezahlung ein\"."
else
  echo "So fängst du an — sag einfach:"
  echo ""
  echo "    \"Baue meine App\""
  echo ""
  echo "Noch keine Idee? Sag das ruhig, dann finden wir gemeinsam eine."
  if [ "$has_env" = false ]; then
    echo "(Um die Einrichtung — Datenbank, .env — kümmere ich mich dabei.)"
  fi
fi

echo "──────────────────────────────────────────────────────────────────"

# Kontext für Claude (der Nutzer sieht diese Zeilen ebenfalls, deshalb neutral
# und knapp formuliert):
echo "[Projektzustand: .env=$has_env, product-brief=$has_brief, eigene Seiten=$custom_pages]"
