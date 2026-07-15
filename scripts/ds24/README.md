# Digistore24 Setup-Skripte

Einmalige, **idempotente** Einrichtungsaufgaben, die nicht zur Laufzeit der App
gehören. Sie können manuell oder von Claude Code (Skill `setup-digistore`)
ausgeführt werden. Reines Node ESM — kein Build nötig.

## Voraussetzungen (Env)

```bash
export DIGISTORE_API_KEY="…"                       # writable/developer-Key
export DIGISTORE_URL="https://www.digistore24.com" # Prod (Test: https://www.digitest24.de)
```

## Produkte aus der Registry synchronisieren (empfohlen)

Für Apps mit mehreren Angeboten (Abo-Tarife + Token-Pakete) ist
**`config/digistore-products.json`** die Source of Truth. `sync-products.mjs` legt
jedes Produkt via `createProduct` an bzw. aktualisiert es via `updateProduct` und
schreibt die `productId` in die Config zurück. **Der Preis wird NICHT am Produkt
gesetzt** (`data[amount]` ist deprecated) — Preis/Intervall je Produkt als
DS24-Payment-Plan pflegen. Alle Umgebungen nutzen dieselben Live-Produkte.

```bash
# Dry-Run (alle Produkte):
node scripts/ds24/sync-products.mjs

# Anlegen/Aktualisieren + productId(s) zurückschreiben:
node scripts/ds24/sync-products.mjs --apply

# Nur ein Produkt:
node scripts/ds24/sync-products.mjs --key pro --apply
```

Freigabe (Go-Live) beantragen — setzt je Produkt `approval_status=requested`:

```bash
node scripts/ds24/request-approval.mjs --siteowner <marktplatz-id> --apply
```

### Einzelnes Produkt (Alt-Weg)

`create-product.mjs` legt ein einzelnes Basisprodukt an (für den createBuyUrl-Weg
ohne Registry). Idempotent über `name_intern`; `--update` aktualisiert.

```bash
node scripts/ds24/create-product.mjs --saas "Paid Challenge" --tarif "Gold" --apply
```

## IPN-Anbindung einrichten (idempotent)

`ipnSetup` ist über `domain_id` von Haus aus idempotent: bestehende Anbindung
wird aktualisiert (Duplikate entfernt), sonst neu angelegt. Die Defaults für
Events (payment/refund/chargeback/payment_missed/last_paid_day), Timing
(vor Dankesseite) und Kategorie (orders) passen bereits zum IPN-Handler.

```bash
# Dry-Run:
node scripts/ds24/ipn-setup.mjs \
     --url "https://app.example.de/api/ipn/<vendor>" --saas "Paid Challenge" --env prod

# Ausführen — DS24 erzeugt eine SHA512-Passphrase und gibt sie zurück:
node scripts/ds24/ipn-setup.mjs \
     --url "https://app.example.de/api/ipn/<vendor>" --saas "Paid Challenge" --env prod --apply
#   → ausgegebene Passphrase in der App (vendor_settings.ds24_ipn_passphrase) hinterlegen.

# Oder eine bereits in der App erzeugte Passphrase mitgeben (identisch koppeln):
node scripts/ds24/ipn-setup.mjs --url "https://…/api/ipn/<vendor>" \
     --saas "Paid Challenge" --env prod --passphrase "<aus Onboarding>" --apply
```

Die `<vendor>`-URL zeigt die App im Onboarding (`/onboarding/digistore`).
Hinweis: DS24 prüft die URL beim Einrichten per GET auf HTTP 200 — die IPN-Route
des Templates beantwortet GET mit „OK".

## Hinweis zu API-Feldnamen

Alle verwendeten Calls sind gegen die echten DS24-API-Quellen verifiziert:
`createProduct`, `updateProduct`, `getProductList`, `ipnInfo` und `ipnSetup`.
Beide Skripte sind Dry-Run per Default; erst `--apply` verändert etwas.
