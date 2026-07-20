# Guardrails für diese App

Du (und jede KI-Assistenz) baust eine **SAAS-Anwendung mit Digistore24-Abrechnung**
auf diesem Template. Bleib auf dem goldenen Pfad. Reiß die Grundstruktur nicht heraus.

Es gibt geführte Skills in `.claude/skills/` — nutze sie in dieser Reihenfolge:
- **`market-research`** — wenn noch keine klare Idee da ist: Interview + Recherche
  → Zielgruppe, Herausforderungen und konkreter Produktvorschlag (Product-Brief).
- **`build-app`** — Einstiegspunkt: Archetyp wählen, Datenmodell + Seiten anlegen.
- **`setup-digistore`** — Abrechnung einrichten (API-Key, IPN, Checkout).
- **`billing-modes`** — *(optional)* Abos (monatl./jährl.) und/oder Prepaid-Token
  mit Auto-Aufladen einrichten + Abo-Selbstverwaltung (Kündigen/Bezahldaten/Rechnungen).
- **`security-gateway`** — vor dem Launch: Sicherheitslücken scannen und beheben.
- **`performance-gateway`** — sicherstellen, dass ~100 parallele Nutzer flüssig laufen.
- **`compliance-check`** — Rechtsseiten (Impressum/Datenschutz/AGB/Widerruf) & DSGVO.
- **`go-live`** — App online stellen und live verifizieren.
- **`go-to-market`** — Vermarktung: Positionierung, Kanäle, Launch-Plan, Content
  (Landingpage, E-Mails, Video-Skripte).
- **`guardrails`** — durchgehende Sicherheitsregeln (Geld/Secrets/Kundendaten).

Der komplette Weg (für den Nutzer möglichst einfach, jeder Schritt übergibt an den
nächsten):

**(0) Idee** `market-research` → **(1) Bauen** `build-app` → **(2) Bezahlung**
`setup-digistore` *(→ optional `billing-modes` für Abos/Prepaid-Token)* →
**(3) Sicherheit** `security-gateway` → **(4) Skalierung** `performance-gateway` →
**(5) Recht** `compliance-check` → **(6) Live** `go-live` → **(7) Vermarktung**
`go-to-market`. Begleitend: `guardrails`.

## Regeln

- **Login ist nicht optional.** Alle App-Seiten sind geschützt (siehe
  `middleware.ts` + `auth.ts`), außer Startseite, `/login`, `/optin/*` und dem
  IPN-Endpoint `/api/ipn/*` (der über die SHA512-Signatur abgesichert ist).
- **IPN-Signaturprüfung (SHA512) ist Pflicht.** `lib/digistore/ipn.ts` niemals
  abschalten. Order-Status nur über IPN-Events setzen.
- **Keine Secrets im Code.** Aus `process.env` lesen, neue Variablen in
  `.env.example` ergänzen. Vendor-Zugangsdaten liegen in `vendor_settings`.
- **Kein Mock-/Demo-Fallback** bei Digistore-API-Fehlern — Fehler werfen.
- **Datenbankänderungen nur per Migration.** Schema in `db/schema.ts` ändern,
  dann `make db-generate` → `make db-migrate`; die Datei in `drizzle/` wird
  eingecheckt und nach dem Einspielen nie mehr editiert. `db:push` nur gegen eine
  leere lokale DB, niemals gegen Staging/Produktion. Siehe `docs/database.md`.
- **Design-System nutzen.** shadcn/ui + Tokens aus `app/globals.css`, keine
  hart kodierten Farben, keine eigene UI erfinden.
- **Tests sind Pflicht.** Jedes Feature bekommt `vitest`-Tests (Vorbilder in
  `lib/digistore/*.test.ts`); `npm run test` und `npm run typecheck` müssen grün
  sein, bevor es weitergeht. Die CI (`.github/workflows/ci.yml`) führt sie bei
  jedem Push automatisch aus.

## Ein Feature hinzufügen

1. Datenmodell in `db/schema.ts` erweitern → `make db-generate` (erzeugt eine
   Migration in `drizzle/`) → Datei prüfen → `make db-migrate`. Die Migration
   gehört mit in den Commit. Details: `docs/database.md`.
2. Geschützte Seite/Route unter `app/dashboard/…` bauen; kaufabhängige Inhalte an
   `orders.status` koppeln.
3. UI-Komponenten via `npx shadcn@latest add <component>`.
4. **Tests schreiben** (`vitest`) für die neue Logik/Regeln.
5. `npm run typecheck && npm run test` (grün) vor dem Deploy.

## Benutzer & Rollen

Die `users`-Tabelle hat ein `role`-Feld (`db/schema.ts`):
- **`owner`** — SAAS-Betreiber (Admin). Zugriff auf Admin-Bereiche.
- **`member`** — normaler Kunde (Default beim Selbst-Login per Magic-Link).

**Admin-Bereiche absichern:** In Server-Komponenten `requireOwner()` aus
`lib/authz.ts` als erste Zeile aufrufen (kein Login → `/login`, kein owner →
`/dashboard`). Vorbild: `app/dashboard/admin/page.tsx`. Für reine Prüfungen gibt
es `isOwner(role)` / `hasRole(role, [...])`.

**Account per CLI anlegen / Rolle setzen** (idempotenter Upsert nach E-Mail; der
Betreiber loggt sich danach ganz normal per Magic-Link ein):

```bash
make user-create ARGS="--email chef@example.de --role owner --apply"
make user-list                       # oder: ARGS="--role owner"
# direkt: node scripts/users/create-user.mjs --email … --role owner --apply
```

Dry-Run ist Standard; erst `--apply` schreibt. Details: `scripts/users/README.md`.

## Lokale Befehle

Alles läuft über das `Makefile` (`make` allein zeigt die Übersicht):

- `make start` — Datenbank + Migrationen + App (http://localhost:3000)
- `make stop` — App + Datenbank stoppen · `make restart` · `make logs` · `make status`
- `make test` — TypeScript-Prüfung + Tests (u. a. IPN-Signaturprüfung)
- `make db-generate` / `make db-migrate` — Migration erzeugen / einspielen
- `make db-reset` — lokale DB leeren, migrieren, Seed (**nur lokal**)
- `make user-create ARGS="--email … --role owner --apply"` — Betreiber-/Admin-Account anlegen
- `make build` — Produktions-Build

Die npm-Skripte dahinter (`npm run dev`, `npm run db:migrate`, …) bleiben
nutzbar; im Zweifel den `make`-Befehl nennen, der ist für Nicht-Entwickler gedacht.

## STOPP-Kriterien

Bei Änderungen an Abrechnungslogik, Signatur-/Auth-Prüfungen, dem Export/Löschen
von Kundendaten oder neuen externen Zahlungs-/Datenintegrationen: erst `guardrails`
lesen und im Zweifel einen Menschen einbeziehen.
