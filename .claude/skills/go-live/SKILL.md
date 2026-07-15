---
name: go-live
description: Bringt die App online (Deployment) und verifiziert, dass alles live funktioniert. Führt durch Pre-Flight-Check, Hosterwahl (Railway/Render/Fly), Umgebungsvariablen/Secrets, Datenbank-Migration in Produktion, Digistore-IPN auf die Live-Domain, Smoke-Test und Re-Check von Sicherheit/Performance gegen die Live-Instanz. Nutze dies, wenn die App gebaut, abgesichert und skaliert ist — vor der Vermarktung.
---

# Go-Live — online stellen und verifizieren

Ziel: die App **zuverlässig live** bekommen und beweisen, dass der Kauf-zu-Zugang-
Fluss in Produktion funktioniert. Führe den Nutzer Schritt für Schritt; er muss
nichts Technisches auswendig können.

## 1. Pre-Flight (vor dem Deploy)

- **Grün lokal:** `npm run typecheck && npm run test && npm run build` ohne Fehler.
- **Env vollständig:** `AUTH_SECRET` (`openssl rand -hex 32`), `DATABASE_URL`
  (managed Postgres), `APP_URL` (= Live-Domain), mindestens ein Auth-Provider,
  ggf. `DIGISTORE_DEVELOPER_KEY`. Alle in `.env.example` gelistet.
- **Migrationen bereit:** `drizzle/` aktuell (`npm run db:generate` nach Schemaänderungen).

## 2. Hosten

- Hoster wählen: **Railway / Render / Fly.io** + **managed Postgres**. Schritt-für-
  Schritt siehe [`docs/DEPLOY.md`](../../docs/DEPLOY.md).
- Env-Variablen/Secrets beim Hoster setzen (nicht im Code!).
- Deployen. Start: `npm run start`.

## 3. Datenbank in Produktion

- Nach dem ersten Deploy einmalig migrieren: `npm run db:migrate`
  (bzw. gegen die Prod-`DATABASE_URL`).

## 4. Digistore: Produkte, Freigabe (Approval) & IPN auf Live

Alle Umgebungen nutzen **dieselben Live-Produkte** (siehe `docs/environments.md`).
Vor dem Verkauf einmalig:

1. **Produkte synchronisieren** (aus `config/digistore-products.json`):
   `DIGISTORE_API_KEY=... node scripts/ds24/sync-products.mjs --apply`
   → legt via `createProduct` an / aktualisiert via `updateProduct` und schreibt
   die `productId`(s) in die Config zurück.
2. **Preis/Intervall je Produkt** in Digistore24 als **Payment-Plan** anlegen
   (der Preis lässt sich nicht per API am Produkt setzen — `data[amount]` ist
   deprecated). Für Abos das Intervall (monatlich/jährlich), für Token-Pakete den
   Paketpreis.
3. **Freigabe beantragen (Approval):**
   `DIGISTORE_API_KEY=... node scripts/ds24/request-approval.mjs --siteowner <id> --apply`
   → setzt je Produkt `approval_status = requested` (via `updateProduct`). Die
   Siteowner-ID des DS24-Marktplatzes steht im DS24-Konto. Produkte werden erst
   nach Freigabe durch Digistore24 öffentlich verkaufbar.
4. **IPN auf die Live-Domain** setzen (im Onboarding ablesen oder per Skript):
   `node scripts/ds24/ipn-setup.mjs --url "https://DEINE-DOMAIN/api/ipn/<vendor>" --saas "..." --env prod --apply`
   In Digistore24 **SHA512** wählen; Passphrase = die aus dem Onboarding/Skript.

> Lokal testen (DEV): IPNs via kostenlosem Cloudflare Quick Tunnel empfangen —
> `bash scripts/dev/tunnel.sh`, dann die trycloudflare-URL als IPN-Ziel setzen
> (`docs/environments.md`).

## 5. Smoke-Test (live)

- `https://DEINE-DOMAIN/api/healthz` → `{"status":"ok"}`, `/api/readyz` → `ready`.
- Login testen (Google/E-Mail).
- **Kauf-Fluss:** in Digistore24 „Verbindung testen" auslösen (IPN `connection_test`
  → 200) und einen echten/Test-Kauf durchspielen → Bestellung erscheint, Zugang
  wird freigeschaltet.
- Custom-Domain + HTTPS aktiv.

## 6. Sicherheit & Performance gegen LIVE prüfen

- **`security-gateway`** und **`performance-gateway`** noch einmal gegen die
  Live-Instanz laufen lassen (echter Lasttest gegen die Live-URL, `-c 100`).
  Erst wenn das grün ist, ist „live" wirklich fertig.

## 7. Absichern

- Rollback-Weg kennen (vorheriges Deploy beim Hoster zurückrollen).
- Backups der Produktions-DB aktiviert.

## Prinzipien
- **Erst live testen, dann bewerben.** Nichts vermarkten, was nicht live verifiziert ist.
- **Secrets nur beim Hoster**, nie im Code/Repo.

Nächster Schritt nach erfolgreichem Go-Live: **`go-to-market`** (Vermarktung).
