# Umgebungen: DEV · STAGING · PROD

Die App läuft in bis zu drei Umgebungen. **Alle nutzen dieselben Live-Produkte auf
Digistore24** (`digistore24.com`) — es gibt genau **eine** Produkt-Menge und **eine**
`productId` je Angebot (`config/digistore-products.json`). Umgebungen unterscheiden
sich also **nicht** in den DS24-Produkten, sondern nur in:

| Was | DEV (lokal) | STAGING (optional) | PROD |
|-----|-------------|--------------------|------|
| `APP_URL` | `http://localhost:3000` | Staging-Domain | Live-Domain |
| `DATABASE_URL` | lokale Postgres (Docker) | Staging-DB | Prod-DB |
| `DIGISTORE_URL` | `https://www.digistore24.com` (Live) | dito | dito |
| Produkte / `productId` | **dieselben Live-Produkte** | dieselben | dieselben |
| IPN-Ziel | Cloudflare Quick Tunnel → localhost | Staging-Domain | Live-Domain |
| Zahlungen | **DS24-Testkäufe** | Testkäufe | echte Käufe |
| E-Mail-Versand | optional | **Pflicht** | **Pflicht** |
| Login ohne Mail-Konto | **ja** (Entwicklungs-Login) | nein | nein |

> Weil alle Umgebungen auf die Live-Produkte gehen, wird in DEV/STAGING mit
> **Digistore24-Testkäufen** (Test-Zahlungsart) gearbeitet — kein echtes Geld,
> aber echte Produkte/IPNs.

`APP_ENV` (`development` | `staging` | `production`) benennt die Umgebung nicht
nur — an ihr hängen **harte Regeln**:

- **STAGING und PROD verlangen einen E-Mail-Versand.** Fehlt er, bricht der
  Serverstart mit einer Erklärung ab (`instrumentation.ts` → `lib/env-guard.ts`).
  Lieber ein klarer Fehler beim Deploy als eine laufende App, bei der sich
  niemand anmelden kann.
- **Der Entwicklungs-Login gilt nur in DEV.** Ist kein Mailversand konfiguriert,
  meldet die Login-Seite lokal ohne Magic-Link und ohne Passwort an, damit du
  sofort loslegen kannst. Vier Bedingungen müssen dafür zugleich gelten:
  `APP_ENV`=development, `NODE_ENV`≠production, `APP_URL` auf localhost, und
  kein Mailversand. Sobald du `make mail-setup` ausführst, verschwindet er.
- **Unbekannte `APP_ENV`-Werte gelten als `production`.** Ein Tippfehler führt
  also zur strengsten Umgebung, nicht zur lockersten.

Die konkreten Werte kommen aus der jeweiligen `.env` bzw. den Secrets des Hosters.

## Lokale IPNs empfangen (DEV) — Cloudflare Quick Tunnel

Digistore24 muss den IPN per HTTPS erreichen. Lokal geht das ohne Zusatzdienste
über einen **kostenlosen Cloudflare Quick Tunnel** (kein Account, keine Domain):

```bash
npm run dev                         # App auf http://localhost:3000
bash scripts/dev/tunnel.sh          # → https://<zufall>.trycloudflare.com
```

Dann `APP_URL` auf die Tunnel-URL setzen und `make ds24-sync ARGS=--apply`
laufen lassen — das richtet die IPN auf die Tunnel-URL ein (Pfad immer
`/api/ipn`). Alternativ direkt:

```bash
node scripts/ds24/ipn-setup.mjs \
  --url "https://<zufall>.trycloudflare.com/api/ipn" --apply
```

Hinweise:
- Die Tunnel-URL **wechselt bei jedem Start** → IPN-Ziel dann erneut setzen.
  Die `domain_id` bleibt dabei stabil (`local-<projektname>`, in der `.env`), die
  Anbindung wird also aktualisiert statt vervielfacht.
- DS24 sendet IPNs immer an **die zuletzt für den Vendor eingerichtete URL**. Für
  eine Dev-Session das Ziel auf den Tunnel setzen, danach für PROD wieder auf die
  Live-Domain (oder einen separaten Test-Vendor/Sub-Account nutzen).
- Die IPN-Signaturprüfung (SHA512) gilt auch lokal — `DIGISTORE_IPN_PASSPHRASE`
  in der `.env` muss zur DS24-Einstellung passen.

## Produkte & Go-Live

Produkte werden **einmal** gegen die Live-Produkte gepflegt (nicht je Umgebung):

```bash
DIGISTORE_API_KEY=... node scripts/ds24/sync-products.mjs --apply     # anlegen/aktualisieren
# je Produkt in DS24 einen Payment-Plan (Preis/Intervall) anlegen
DIGISTORE_API_KEY=... node scripts/ds24/request-approval.mjs --siteowner <id> --apply
```

Details zum Go-Live: Skill **`go-live`**.
