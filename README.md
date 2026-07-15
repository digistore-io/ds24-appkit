# Digistore SAAS App Template

Ein Starter-Template für **SAAS-Anwendungen, die über Digistore24 abrechnen** —
gebaut, damit du es **gemeinsam mit Claude Code** ausbauen kannst, auch ohne
Programmiererfahrung.

**Stack:** Next.js 15 (App Router) · TypeScript · Drizzle ORM + Postgres ·
Auth.js v5 (Google + E-Mail) · Tailwind v4 + shadcn/ui.

Enthält fertig verdrahtet:
- 🔐 **Anmeldung** (Google-Login und/oder E-Mail-Magic-Link)
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

## Schnellstart (lokal)

```bash
# 1. Abhängigkeiten
npm install

# 2. Postgres starten
docker compose up -d

# 3. Env vorbereiten
cp .env.example .env
#   AUTH_SECRET setzen:  openssl rand -hex 32
#   Mindestens einen Auth-Provider (Google ODER Resend) eintragen.

# 4. Datenbank-Schema anlegen
npm run db:push

# 5. Loslegen
npm run dev        # http://localhost:3000
```

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
scripts/ds24/       Setup: Produkte synchronisieren, Freigabe, IPN einrichten
scripts/dev/        tunnel.sh (Cloudflare Quick Tunnel für lokale IPNs)
.claude/skills/     geführte Skills für den Ausbau mit Claude Code
```

Umgebungen (DEV/STAGING/PROD) & lokale Webhooks: siehe [`docs/environments.md`](docs/environments.md).

## Sicherheit

- IPN-Signaturprüfung (SHA512) ist **Pflicht** — niemals deaktivieren.
- API-Keys/Secrets gehören in `.env` bzw. die Secret-Verwaltung deines Hosters,
  **nie in den Code**.
- Alles außer öffentlichen Seiten (Start, Login, Opt-in) und dem IPN-Endpoint ist
  auth-geschützt.
