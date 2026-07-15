---
name: setup-digistore
description: Richtet die Digistore24-Abrechnung für die App ein — API-Key hinterlegen und verifizieren, IPN-Webhook-URL und SHA512-Passphrase erzeugen, in Digistore24 eintragen, Verbindung testen und Checkout-Links generieren. Nutze dies, sobald die App Verkäufe empfangen oder Kaufabschlüsse verarbeiten soll.
---

# Digistore24-Abrechnung einrichten

Die gesamte Digistore-Anbindung liegt fertig in `lib/digistore/` und
`app/api/ipn/[vendor]/route.ts`. Deine Aufgabe ist, den Nutzer durch die
Einrichtung zu führen — **nicht**, die Integration neu zu schreiben.

## So funktioniert die Abrechnung

Digistore24 ist der Bezahl-Anbieter. Deine App wickelt kein Geld ab, sondern
**reagiert auf Ereignisse** von Digistore24:

- Kauf → IPN-Event `on_payment` → neue Zeile in `orders` mit Status `paid`.
- Rückerstattung/Chargeback/verpasste Abo-Zahlung → Status wird aktualisiert.
- Jede Order ist über `ds24OrderId` eindeutig (idempotent).

## Einrichtungs-Schritte (führe den Nutzer hier durch)

1. **App starten & anmelden**, dann `/onboarding/digistore` öffnen.
2. **API-Key** verbinden — zwei Wege:
   - **Empfohlen (1 Klick): „Mit Digistore24 verbinden".** Erscheint, wenn der
     SAAS-Betreiber `DIGISTORE_DEVELOPER_KEY` gesetzt hat. Der Vendor meldet sich
     bei Digistore24 an, bestätigt, und der API-Key wird automatisch übernommen
     (kein Kopieren). Flow: `lib/digistore/connect.ts` + Routen unter
     `app/onboarding/digistore/connect/…` (requestApiKey → retrieveApiKey).
   - **Manuell:** API-Key (Digistore24 → Einstellungen → API) eintragen. Für
     Checkout-Links wird ein **`writable`**-Key benötigt. Die App verifiziert ihn
     sofort per `verifyApiKey` (`lib/digistore/client.ts`).
3. **IPN einrichten**: Die App erzeugt IPN-URL (`/api/ipn/<userId>`) + eine
   **SHA512-Passphrase**. Beides in Digistore24 unter *Einstellungen → IPN*
   eintragen, Signaturmethode **SHA512**.
4. **Verbindung testen**: In Digistore24 „Verbindung testen“ auslösen. Der erste
   gültige IPN setzt `ds24IpnVerified = true` (Status wird im Onboarding grün).

## Checkout-Links erzeugen (mit Cache)

Nutze **`getOrCreateBuyUrl`** aus `lib/digistore/buyUrl.ts` (benötigt `writable`-Key).
Es schickt einen kompletten Custom Payment Plan mit — ein Basisprodukt je Tarif
genügt, Preis/Währung/Intervall bestimmt die App zur Laufzeit. Setze `thankyouUrl`
auf `/optin/[ORDER_ID]`, damit Käufer nach dem Kauf dort landen.

- URLs werden pro Angebot **20h gecacht** (Tabelle `buy_url_cache`).
- **Ändert sich das Angebot** (Preis, Titel, Intervall …), wird automatisch eine
  neue URL erzeugt (`offerHash`).
- Nutzerspezifische URLs (buyer/affiliate/upgrade) werden **nie** gecacht.

Details & Beispiel: `docs/digistore-createbuyurl.md`.

## Einmalige Einrichtung per Skript (idempotent)

Manche Schritte gehören nicht in die Laufzeit-App. Dafür gibt es Skripte unter
`scripts/ds24/` (Node ESM, Dry-Run per Default, `--apply` zum Ausführen):

- **Produkt anlegen:** `node scripts/ds24/create-product.mjs --saas "Paid Challenge"
  --tarif "Gold" --apply` (idempotent über `name_intern`; Name/Beschreibung sind
  Platzhalter, den Preis liefert `createBuyUrl`; `--update` aktualisiert ein
  bestehendes Produkt via `updateProduct`).
- **IPN-Anbindung:** `node scripts/ds24/ipn-setup.mjs --url
  "https://DEINE-DOMAIN/api/ipn/<vendor>" --saas "Paid Challenge" --env prod --apply`
  (idempotent über `domain_id`). DS24 erzeugt dabei eine SHA512-Passphrase und gibt
  sie zurück → in der App unter `vendor_settings.ds24_ipn_passphrase` hinterlegen
  (oder eine bestehende via `--passphrase` mitgeben). Voraussetzung:
  `DIGISTORE_API_KEY` in der Umgebung.

Siehe `scripts/ds24/README.md`.

## Nächster Schritt

Soll die App **wiederkehrend (Abo) oder nach Verbrauch (Prepaid-Token)** abrechnen?
Dann jetzt **`billing-modes`** — richtet Abos (monatl./jährl.), Prepaid-Token mit
Auto-Aufladen (`createBillingOnDemand`) und die Abo-Selbstverwaltung (Kündigen,
Bezahldaten, Rechnungen) ein.

Danach vor dem Launch der Reihe nach: **`security-gateway`** (Sicherheit) →
**`performance-gateway`** (Skalierung) → **`compliance-check`** (Recht) →
**`go-live`** (online stellen) → **`go-to-market`** (Vermarktung).

## Wichtige Regeln

- **Signaturprüfung ist Pflicht und fail-closed.** Ohne gültige SHA512-Signatur
  wird ein IPN mit `403` abgelehnt. Diese Prüfung niemals lockern.
- **Kein Demo-/Mock-Fallback.** Schlägt ein API-Call fehl, wird ein Fehler
  geworfen — ein fehlgeschlagener Checkout darf nie als Erfolg gelten.
- **API-Key & Passphrase sind Secrets.** Sie liegen in der DB (`vendor_settings`),
  nie im Code oder in Logs.
- Feld-Referenz (IPN-Payload, Events, createBuyUrl-Parameter): siehe
  `docs/DEPLOY.md` und die Kommentare in `lib/digistore/`.
