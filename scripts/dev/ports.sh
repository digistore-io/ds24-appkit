#!/usr/bin/env bash
# Kleine Port-Helfer für die Start-Skripte.
#
# Warum nicht lsof/ss: die sind nicht überall installiert, und lsof zeigt keine
# Sockets fremder Benutzer. Ein Verbindungsversuch über bash /dev/tcp ist
# überall verfügbar und beantwortet genau die Frage, auf die es ankommt:
# „Nimmt hier schon jemand Verbindungen an?"

# port_belegt <port> → Exit 0, wenn belegt.
port_belegt() {
  local p="$1"
  (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null && exec 3<&- && return 0
  return 1
}

# freier_port <start> [max_versuche] → gibt den ersten freien Port ab <start> aus.
# Ohne Treffer wird <start> ausgegeben (dann meldet sich später ohnehin Docker).
freier_port() {
  local p="$1" versuche="${2:-40}" i=0
  while [ "$i" -lt "$versuche" ]; do
    port_belegt "$p" || { echo "$p"; return 0; }
    p=$((p + 1))
    i=$((i + 1))
  done
  echo "$1"
}
