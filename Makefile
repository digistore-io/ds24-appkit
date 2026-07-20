# Makefile — die Befehle für den Alltag mit dieser App.
#
# Die fünf wichtigsten:
#   make start        App + Datenbank starten (inkl. Migrationen)
#   make stop         App + Datenbank stoppen
#   make test         Tests + TypeScript-Prüfung
#   make db-migrate   ausstehende Datenbank-Migrationen einspielen
#   make db-reset     Datenbank leeren und neu aufbauen (nur lokal!)
#
# `make` ohne Argument zeigt alle Befehle.

SHELL      := /bin/bash
PORT       ?= 3000
DEV_DIR    := .dev
DEV_PID    := $(DEV_DIR)/dev.pid
DEV_LOG    := $(DEV_DIR)/dev.log
# Argumente durchreichen, z. B.: make user-create ARGS="--email … --apply"
ARGS       ?=

.DEFAULT_GOAL := help

.PHONY: help
help: ## Diese Übersicht anzeigen
	@echo "Befehle für diese App:"
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | sort | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ── Start / Stop ────────────────────────────────────────────────────────────
.PHONY: start
start: .env node_modules db-up db-migrate ## Alles starten: DB + Migrationen + App (http://localhost:$(PORT))
	@mkdir -p $(DEV_DIR)
	@if [ -f $(DEV_PID) ] && kill -0 "$$(cat $(DEV_PID))" 2>/dev/null; then \
	  echo "App läuft bereits (PID $$(cat $(DEV_PID))) — http://localhost:$(PORT)"; \
	  exit 0; \
	fi
	@# setsid: eigene Prozessgruppe, damit `make stop` npm UND next zuverlässig
	@# beendet (ohne bleibt sonst ein Kindprozess zurück).
	@if command -v setsid >/dev/null 2>&1; then \
	  setsid npm run dev -- --port $(PORT) > $(DEV_LOG) 2>&1 < /dev/null & echo $$! > $(DEV_PID); \
	else \
	  nohup npm run dev -- --port $(PORT) > $(DEV_LOG) 2>&1 < /dev/null & echo $$! > $(DEV_PID); \
	fi
	@echo "→ App startet … Logs: make logs   (Stoppen: make stop)"
	@for i in $$(seq 1 60); do \
	  if curl -sf -o /dev/null "http://localhost:$(PORT)"; then \
	    echo "✓ App läuft: http://localhost:$(PORT)"; exit 0; fi; \
	  sleep 1; \
	done; \
	echo "✗ App antwortet nach 60s nicht — letzte Logzeilen:"; tail -n 30 $(DEV_LOG); exit 1

.PHONY: stop
stop: ## Alles stoppen: App + Datenbank
	@if [ -f $(DEV_PID) ]; then \
	  PID=$$(cat $(DEV_PID)); \
	  kill -TERM -"$$PID" 2>/dev/null || { pkill -P "$$PID" 2>/dev/null; kill "$$PID" 2>/dev/null; } || true; \
	  rm -f $(DEV_PID); \
	fi
	@# Fallback: alles, was noch auf dem Port lauscht (z. B. nach einem Absturz).
	@if command -v lsof >/dev/null 2>&1; then \
	  PIDS=$$(lsof -ti tcp:$(PORT) 2>/dev/null || true); \
	  [ -n "$$PIDS" ] && kill $$PIDS 2>/dev/null || true; \
	fi
	@echo "✓ App gestoppt"
	@docker compose down
	@echo "✓ Datenbank gestoppt (Daten bleiben erhalten — löschen: make db-nuke)"

.PHONY: restart
restart: stop start ## Neu starten

.PHONY: status
status: ## Läuft die App? Läuft die Datenbank?
	@if [ -f $(DEV_PID) ] && kill -0 "$$(cat $(DEV_PID))" 2>/dev/null; then \
	  echo "App:       läuft (PID $$(cat $(DEV_PID))) — http://localhost:$(PORT)"; \
	else echo "App:       gestoppt"; fi
	@docker compose ps

.PHONY: logs
logs: ## Log der laufenden App verfolgen (Strg-C zum Beenden)
	@touch $(DEV_LOG) && tail -f $(DEV_LOG)

.PHONY: dev
dev: .env node_modules db-up db-migrate ## App im Vordergrund starten (Logs direkt im Terminal)
	npm run dev -- --port $(PORT)

# ── Tests & Qualität ────────────────────────────────────────────────────────
.PHONY: test
test: node_modules ## Tests (vitest) + TypeScript-Prüfung
	npm run typecheck
	npm run test

.PHONY: lint
lint: node_modules ## Linten
	npm run lint

.PHONY: build
build: node_modules ## Produktions-Build
	npm run build

# ── Datenbank ───────────────────────────────────────────────────────────────
# Der goldene Pfad: Schema in db/schema.ts ändern → `make db-generate` erzeugt
# eine SQL-Migration in drizzle/ → `make db-migrate` spielt sie ein. Migrationen
# werden eingecheckt; in Produktion läuft NUR `make db-migrate` (nie db-push).
# Details: docs/database.md
.PHONY: db-up
db-up: ## Postgres starten (Docker) und auf Bereitschaft warten
	@bash scripts/db/up.sh

.PHONY: db-down
db-down: ## Postgres stoppen (Daten bleiben erhalten)
	@docker compose down

.PHONY: db-migrate
db-migrate: .env node_modules db-up ## Ausstehende Migrationen einspielen (auch in Produktion)
	npm run db:migrate

.PHONY: db-generate
db-generate: node_modules ## Migration aus einer Schemaänderung erzeugen (db/schema.ts)
	npm run db:generate
	@echo "→ Neue Datei in drizzle/ prüfen, einchecken und mit 'make db-migrate' einspielen."

.PHONY: db-reset
db-reset: .env node_modules db-up ## Datenbank leeren + Migrationen + Seed (NUR lokal)
	npm run db:reset

.PHONY: db-seed
db-seed: .env node_modules db-up ## Testdaten/Admin-Account anlegen (scripts/db/seed.mjs)
	npm run db:seed

.PHONY: db-studio
db-studio: .env node_modules ## Datenbank im Browser ansehen (Drizzle Studio)
	npm run db:studio

.PHONY: db-nuke
db-nuke: ## Postgres stoppen UND das Docker-Volume löschen (alle Daten weg)
	docker compose down -v

# ── Benutzer & Rollen ───────────────────────────────────────────────────────
.PHONY: user-create
user-create: ## Benutzer anlegen/Rolle setzen (ARGS='--email … --role owner --apply')
	node scripts/users/create-user.mjs $(ARGS)

.PHONY: user-list
user-list: ## Benutzer + Rollen auflisten (ARGS='--role owner')
	node scripts/users/list-users.mjs $(ARGS)

# ── Digistore24-Setup ───────────────────────────────────────────────────────
.PHONY: ds24-sync
ds24-sync: ## Produkte aus config/digistore-products.json anlegen (ARGS=--apply)
	node scripts/ds24/sync-products.mjs $(ARGS)

.PHONY: ds24-ipn
ds24-ipn: ## IPN-Anbindung einrichten (ARGS="--url … --saas … --apply")
	node scripts/ds24/ipn-setup.mjs $(ARGS)

.PHONY: tunnel
tunnel: ## Lokale IPNs empfangen: Cloudflare Quick Tunnel
	bash scripts/dev/tunnel.sh

# ── Hilfsziele (laufen automatisch, wenn nötig) ─────────────────────────────
node_modules: package-lock.json
	npm install
	@touch node_modules

.env:
	@cp .env.example .env
	@echo "→ .env aus .env.example erzeugt. Bitte AUTH_SECRET setzen:"
	@echo "  openssl rand -hex 32"
