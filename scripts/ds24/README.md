# Digistore24 Setup-Skripte

Einmalige, **idempotente** Einrichtungsaufgaben, die nicht zur Laufzeit der App
gehören. Sie können manuell oder von Claude Code (Skill `setup-digistore`)
ausgeführt werden. Reines Node ESM — kein Build nötig.

## Voraussetzungen (Env)

```bash
export DIGISTORE_API_KEY="…"                       # writable/developer-Key
export DIGISTORE_URL="https://www.digistore24.com" # API-Basis von Digistore24
```

Den API-Key holst du dir mit `make ds24-connect` (= `connect-api-key.mjs`): Das
Skript öffnet den Browser, du bestätigst bei Digistore24, und der Key wird als
`DIGISTORE_API_KEY` in die `.env` geschrieben.

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

Der **Regelfall** ist `make ds24-sync ARGS=--apply` — das legt Produkte an *und*
richtet die IPN ein (Aufruf: `ipn-setup.mjs --auto`). Der `--auto`-Modus leitet
die IPN-URL aus `APP_URL` ab und wählt eine stabile `domain_id`:
- **live/staging** (öffentliche Domain) → aus dem Host, z. B. `app-example-de`;
- **Entwicklung** → `local-<projektname>`, damit eine wechselnde Tunnel-URL die
  Anbindung nicht vervielfacht.

Der Wert wird als `DIGISTORE_IPN_DOMAIN_ID` in die `.env` geschrieben und bleibt
so stabil. `ipnSetup` ist über diese `domain_id` idempotent: bestehende Anbindung
wird aktualisiert (Duplikate entfernt), sonst neu angelegt. Die Defaults für
Events (payment/refund/chargeback/payment_missed/last_paid_day), Timing
(vor Dankesseite) und Kategorie (orders) passen bereits zum IPN-Handler. Die
erzeugte SHA512-Passphrase landet als `DIGISTORE_IPN_PASSPHRASE` in der `.env`;
ist dort schon eine gesetzt, wird sie wiederverwendet.

IPN braucht eine **öffentliche https-URL** (DS24 prüft sie per GET auf HTTP 200 —
die IPN-Route beantwortet GET mit „OK"). In reiner lokaler Entwicklung
überspringt `--auto` den IPN-Teil; nutze `make tunnel` und setze dessen https-URL
als `APP_URL`, um lokal zu testen.

Manuell (Sonderfall, feste Werte statt Ableitung):

```bash
# Dry-Run:
node scripts/ds24/ipn-setup.mjs --url "https://app.example.de/api/ipn" \
     --domain "app.example.de"

# Ausführen (DS24 erzeugt & liefert die Passphrase, wird in die .env geschrieben):
node scripts/ds24/ipn-setup.mjs --url "https://app.example.de/api/ipn" \
     --domain "app.example.de" --apply

# Oder eine bereits vorhandene Passphrase mitgeben (identisch koppeln):
node scripts/ds24/ipn-setup.mjs --url "https://app.example.de/api/ipn" \
     --domain "app.example.de" --passphrase "<aus der .env>" --apply
```

Die IPN-URL ist immer `https://DEINE-DOMAIN/api/ipn` — ohne weitere Pfadsegmente.

## Hinweis zu API-Feldnamen

Alle verwendeten Calls sind gegen die echten DS24-API-Quellen verifiziert:
`createProduct`, `updateProduct`, `getProductList`, `ipnInfo` und `ipnSetup`.
Beide Skripte sind Dry-Run per Default; erst `--apply` verändert etwas.
