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

> Weil alle Umgebungen auf die Live-Produkte gehen, wird in DEV/STAGING mit
> **Digistore24-Testkäufen** (Test-Zahlungsart) gearbeitet — kein echtes Geld,
> aber echte Produkte/IPNs.

`APP_ENV` (`development` | `staging` | `production`) benennt die Umgebung nur; die
konkreten Werte kommen aus der jeweiligen `.env` bzw. den Secrets des Hosters.

## Lokale IPNs empfangen (DEV) — Cloudflare Quick Tunnel

Digistore24 muss den IPN per HTTPS erreichen. Lokal geht das ohne Zusatzdienste
über einen **kostenlosen Cloudflare Quick Tunnel** (kein Account, keine Domain):

```bash
npm run dev                         # App auf http://localhost:3000
bash scripts/dev/tunnel.sh          # → https://<zufall>.trycloudflare.com
```

Dann die angezeigte URL als IPN-Ziel setzen (die `<vendor>`-ID zeigt das Onboarding):

```bash
node scripts/ds24/ipn-setup.mjs \
  --url "https://<zufall>.trycloudflare.com/api/ipn/<vendor>" \
  --saas "Deine App" --env dev --apply
```

Hinweise:
- Die Tunnel-URL **wechselt bei jedem Start** → IPN-Ziel dann erneut setzen.
- DS24 sendet IPNs immer an **die zuletzt für den Vendor eingerichtete URL**. Für
  eine Dev-Session das Ziel auf den Tunnel setzen, danach für PROD wieder auf die
  Live-Domain (oder einen separaten Test-Vendor/Sub-Account nutzen).
- Die IPN-Signaturprüfung (SHA512) gilt auch lokal — Passphrase in
  `vendor_settings` muss zur DS24-Einstellung passen.

## Produkte & Go-Live

Produkte werden **einmal** gegen die Live-Produkte gepflegt (nicht je Umgebung):

```bash
DIGISTORE_API_KEY=... node scripts/ds24/sync-products.mjs --apply     # anlegen/aktualisieren
# je Produkt in DS24 einen Payment-Plan (Preis/Intervall) anlegen
DIGISTORE_API_KEY=... node scripts/ds24/request-approval.mjs --siteowner <id> --apply
```

Details zum Go-Live: Skill **`go-live`**.
