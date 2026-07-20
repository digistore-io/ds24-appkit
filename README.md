# Digistore SAAS App Template

Ein Starter-Template für **SAAS-Anwendungen, die über Digistore24 abrechnen** —
gebaut, damit du es **gemeinsam mit Claude Code** ausbauen kannst, auch ohne
Programmiererfahrung.

**Stack:** Next.js 15 (App Router) · TypeScript · Drizzle ORM + Postgres ·
Auth.js v5 (E-Mail-Token, optional Google) · Tailwind v4 + shadcn/ui.

Enthält fertig verdrahtet:
- 🔐 **Anmeldung** (E-Mail-Token/Magic-Link via Postmark oder SMTP; optional Google)
- 💳 **Digistore24-Abrechnung**: IPN-Webhook mit **SHA512-Signaturprüfung**,
  Checkout-Link-Erzeugung (`createBuyUrl`), Onboarding-Wizard, DSGVO-Opt-in
- 🗄️ **Datenbank** mit Bestell-Statusmaschine (bezahlt/erstattet/Chargeback/…)
- 🩺 Health-Checks (`/api/healthz`, `/api/readyz`) für einfaches Deployment

## Dein Weg zur fertigen SaaS (mit Claude Code)

Starte Claude Code im Projekt und sag einfach, was du willst — die passenden
**Skills** (im Ordner `.claude/skills/`) führen dich Schritt für Schritt. Jeder
Schritt übergibt an den nächsten:

| # | Schritt | Skill | Was passiert |
|---|---------|-------|--------------|
| 0 | **Idee finden** | `market-research` | Interview zu deiner Expertise/Reichweite → Zielgruppe recherchieren → konkreter Produktvorschlag |
| 1 | **App bauen** | `build-app` | Archetyp wählen, Datenmodell + Seiten anlegen |
| 2 | **Bezahlung** | `setup-digistore` | Digistore24 verbinden: API-Key, IPN, Checkout-Links |
| 2b | **Abos & Token** *(optional)* | `billing-modes` | Feste Abos (monatl./jährl.) und/oder Prepaid-Token mit Auto-Aufladen + Abo-Selbstverwaltung |
| 3 | **Sicherheit** | `security-gateway` | App auf Sicherheitslücken scannen und beheben |
| 4 | **Skalierung** | `performance-gateway` | sicherstellen, dass ~100 parallele Nutzer flüssig laufen |
| 5 | **Recht** | `compliance-check` | Impressum/Datenschutz/AGB/Widerruf + DSGVO |
| 6 | **Live** | `go-live` | App online stellen und live verifizieren |
| 7 | **Vermarktung** | `go-to-market` | Positionierung, Kanäle, Launch-Plan + fertiger Content (Landingpage, E-Mails, **Video-Skripte**) |

Beim Bauen (Schritt 1) werden **automatisch Tests** geschrieben und ausgeführt
(`npm run test`); die mitgelieferte CI prüft jeden Push. Durchgehend wacht
**`guardrails`** über Geld, Secrets und Kundendaten.

Hast du schon eine klare Idee? Dann starte bei Schritt 1 („**Baue meine App**").
Sonst beginne mit Schritt 0 („**Ich weiß noch nicht, was ich bauen soll**").
Erst mal nur schauen, wie sich das anfühlt? Der Probelauf
[„Hello World"](docs/hello-world-prompt.md) baut in wenigen Minuten eine kleine
App mit Admin- und Nutzer-Login.

## Schnellstart (lokal)

```bash
make start         # → http://localhost:3000
```

`make start` erledigt alles: Abhängigkeiten installieren, `.env` aus
`.env.example` anlegen, Postgres per Docker starten, Datenbank-Migrationen
einspielen und die App hochfahren. Beim ersten Mal danach noch zwei Dinge in
`.env` eintragen:

- `AUTH_SECRET` — erzeugen mit `openssl rand -hex 32`
- E-Mail-Versand für den Login (Postmark **oder** SMTP; siehe [`docs/auth-setup.md`](docs/auth-setup.md))

Dann `make restart`.

### Die wichtigsten Befehle

| Befehl | Was passiert |
|---|---|
| `make start` | Datenbank + App starten (inkl. Migrationen) |
| `make stop` | App + Datenbank stoppen |
| `make test` | Tests (vitest) + TypeScript-Prüfung |
| `make db-migrate` | ausstehende Datenbank-Migrationen einspielen |
| `make db-reset` | lokale Datenbank leeren, neu migrieren, Seed einspielen |
| `make logs` | Log der laufenden App verfolgen |
| `make` | alle Befehle anzeigen |

Läuft auf deinem Rechner schon etwas auf Port 5432 oder 3000? Dann `DB_PORT` in
`.env` ändern (und den Port in `DATABASE_URL` mitziehen) bzw. `make start PORT=3001`.

### Erste App zum Ausprobieren

Ein fertiger Prompt für eine kleine „Hello-World"-App mit Admin- und
Nutzer-Login — der Admin kann den Text ändern und Accounts verwalten:
[`docs/hello-world-prompt.md`](docs/hello-world-prompt.md). Guter Probelauf,
bevor du deine echte App baust.

## Deployment

Ein Deploy-Artefakt (`output: "standalone"`), ideal für **Railway, Render oder
Fly.io** + managed Postgres. Schritt-für-Schritt: siehe [`docs/DEPLOY.md`](docs/DEPLOY.md).

Danach in Digistore24 als IPN-URL hinterlegen:
`https://DEINE-DOMAIN/api/ipn/<vendor>` (die konkrete URL zeigt dir das Onboarding).

## Projektstruktur

```
app/                Next.js App Router (Seiten + API-Routen)
  api/ipn/[vendor]/ Digistore24 IPN-Webhook (Signaturprüfung + Statusmaschine)
  onboarding/       Digistore-Einrichtung
  optin/            öffentliche DSGVO-Opt-in-Seite
config/             Produkt-Registry (digistore-products.json — Source of Truth)
db/                 Drizzle-Schema + Verbindung (inkl. Abos + Token-Guthaben)
lib/digistore/      DS24-Client, IPN-Verifikation, Produkt-Links, Billing-on-Demand
lib/tokens/         Prepaid-Token: Pakete, Guthaben/Verbrauch, Auto-Aufladen
drizzle/            Datenbank-Migrationen (eingecheckt, laufen überall gleich)
scripts/db/         reset.mjs (lokale DB neu aufbauen) + seed.mjs (Ausgangsdaten)
scripts/ds24/       Setup: Produkte synchronisieren, Freigabe, IPN einrichten
scripts/users/      Accounts/Rollen per CLI anlegen
scripts/dev/        tunnel.sh (Cloudflare Quick Tunnel für lokale IPNs)
.claude/skills/     geführte Skills für den Ausbau mit Claude Code
Makefile            alle Befehle für den Alltag (make = Übersicht)
```

Datenbank & Migrationen: siehe [`docs/database.md`](docs/database.md).
Umgebungen (DEV/STAGING/PROD) & lokale Webhooks: siehe [`docs/environments.md`](docs/environments.md).

## Sicherheit

- IPN-Signaturprüfung (SHA512) ist **Pflicht** — niemals deaktivieren.
- API-Keys/Secrets gehören in `.env` bzw. die Secret-Verwaltung deines Hosters,
  **nie in den Code**.
- Alles außer öffentlichen Seiten (Start, Login, Opt-in) und dem IPN-Endpoint ist
  auth-geschützt.
