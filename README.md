# Digistore SAAS App Template

Ein Starter-Template für **SAAS-Anwendungen, die über Digistore24 abrechnen** —
gebaut, damit du es **gemeinsam mit Claude Code** ausbauen kannst, auch ohne
Programmiererfahrung.

**Stack:** Next.js 15 (App Router) · TypeScript · Drizzle ORM + Postgres ·
Auth.js v5 (E-Mail-Token, optional Google) · Tailwind v4 + shadcn/ui.

Enthält fertig verdrahtet:
- 🔐 **Anmeldung** (E-Mail-Token/Magic-Link via Postmark oder SMTP; optional Google)
  — lokal kommst du auch **ohne Mail-Konto** sofort rein (Entwicklungs-Login)
- 👥 **Benutzerverwaltung** mit zwei Rollen (Admin/Nutzer) — Admins verwalten
  Konten unter `/dashboard/admin/users`
- 🏷️ **Tarif-Seite** (`/tarife`) mit Monats-/Jahresabo und Token-Paketen —
  hart kodiert in `config/digistore-products.json`, zum Umgestalten oder Löschen
- 💳 **Digistore24-Abrechnung**: IPN-Webhook mit **SHA512-Signaturprüfung**,
  Checkout-Link-Erzeugung (`createBuyUrl`), API-Key-Anbindung per
  `make ds24-connect`, DSGVO-Opt-in
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
| 2 | **Bezahlung** | `setup-digistore` | Digistore24 verbinden: `make ds24-connect`, IPN, Checkout-Links |
| 2b | **Abos & Token** *(optional)* | `billing-modes` | Feste Abos (monatl./jährl.) und/oder Prepaid-Token mit Auto-Aufladen + Abo-Selbstverwaltung |
| 3 | **Sicherheit** | `security-gateway` | App auf Sicherheitslücken scannen und beheben |
| 4 | **Skalierung** | `performance-gateway` | sicherstellen, dass ~100 parallele Nutzer flüssig laufen |
| 5 | **Recht** | `compliance-check` | Impressum/Datenschutz/AGB/Widerruf + DSGVO |
| 6 | **Live** | `go-live` | App online stellen und live verifizieren |
| 7 | **Vermarktung** | `go-to-market` | Positionierung, Kanäle, Launch-Plan + fertiger Content (Landingpage, E-Mails, **Video-Skripte**) |

Beim Bauen (Schritt 1) werden **automatisch Tests** geschrieben und ausgeführt
(`npm run test`); die mitgelieferte CI prüft jeden Push. Durchgehend wacht
**`guardrails`** über Geld, Secrets und Kundendaten.

**Du musst dir davon nichts merken.** Starte Claude Code im Projektordner und sag:

> **„Baue meine App"**

Das ist die einzige Tür. Claude fragt dich dann, ob du schon eine Idee hast — und
wenn nicht, findet ihr gemeinsam eine (Schritt 0). Alles Weitere ergibt sich
Schritt für Schritt.

## Schnellstart

```bash
claude             # Claude Code im Projektordner starten
```

Claude begrüßt dich und sagt dir, wie es weitergeht. Um Einrichtung, Datenbank
und Start der App kümmert es sich mit dir zusammen — du musst keinen der unteren
Befehle auswendig können.

### Für Entwickler: die Befehle direkt

Wer lieber selbst tippt: `make start` erledigt alles auf einmal —
Abhängigkeiten installieren, `.env` aus `.env.example` anlegen, Postgres per
Docker starten, Migrationen einspielen, App hochfahren (→ http://localhost:3000).

Zwei Dinge trägst du danach einmalig in `.env` ein:

- `AUTH_SECRET` — erzeugen mit `openssl rand -hex 32`
- E-Mail-Versand für den Login (Postmark **oder** SMTP; siehe [`docs/auth-setup.md`](docs/auth-setup.md))

Dann `make restart`.

Die wichtigsten Befehle im Überblick (`make` allein zeigt alle):

| Befehl | Was passiert |
|---|---|
| `make start` | Datenbank + App starten (inkl. Migrationen) |
| `make stop` | App + Datenbank stoppen |
| `make test` | Tests (vitest) + TypeScript-Prüfung |
| `make smoke` | jede Seite einmal aufrufen — findet „Internal Server Error" |
| `make db-migrate` | ausstehende Datenbank-Migrationen einspielen |
| `make db-reset` | lokale Datenbank leeren, neu migrieren, Seed einspielen |
| `make mail-setup` | E-Mail-Versand einrichten (Postmark oder SMTP) + Testmail |
| `make ds24-connect` | Digistore24-API-Key holen (Browser) und in `.env` speichern |
| `make logs` | Log der laufenden App verfolgen |
| `make` | alle Befehle anzeigen |

Läuft auf deinem Rechner schon etwas auf Port 5432 oder 3000? Dann `DB_PORT` in
`.env` ändern (und den Port in `DATABASE_URL` mitziehen) bzw. `make start PORT=3001`.

## Deployment

Ein Deploy-Artefakt (`output: "standalone"`), ideal für **Railway, Render oder
Fly.io** + managed Postgres. Schritt-für-Schritt: siehe [`docs/DEPLOY.md`](docs/DEPLOY.md).

Danach in Digistore24 als IPN-URL hinterlegen:
`https://DEINE-DOMAIN/api/ipn` (ohne weitere Pfadsegmente).

## Projektstruktur

```
app/                Next.js App Router (Seiten + API-Routen)
  api/ipn/          Digistore24 IPN-Webhook (Signaturprüfung + Statusmaschine)
  optin/            öffentliche DSGVO-Opt-in-Seite
  tarife/           öffentliche Tarif-Seite (rendert die Produkt-Registry)
  dashboard/admin/  Admin-Bereich inkl. Benutzerverwaltung (users/)
config/             Produkt-Registry (digistore-products.json — Tarife, Source of Truth)
db/                 Drizzle-Schema + Verbindung (inkl. Abos + Token-Guthaben)
lib/digistore/      DS24-Client, IPN-Verifikation, Produkt-Links, Billing-on-Demand,
                    Zugangsdaten aus der Umgebung (settings.ts)
lib/tokens/         Prepaid-Token: Pakete, Guthaben/Verbrauch, Auto-Aufladen
lib/users/          Benutzerverwaltung: Regeln (rules.ts) + Datenbank (manage.ts)
lib/roles.ts        Rollen ohne Server-Abhängigkeiten (auch im Browser nutzbar)
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
