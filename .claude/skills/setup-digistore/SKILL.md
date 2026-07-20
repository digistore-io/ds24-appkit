---
name: setup-digistore
description: Richtet die Digistore24-Abrechnung für die App ein — API-Key per `make ds24-connect` in die `.env` holen, dann mit `make ds24-sync` Produkte anlegen und die IPN-Anbindung (Webhook + SHA512-Passphrase) per API registrieren, Verbindung testen und Checkout-Links generieren. Der Agent führt die Befehle selbst aus. Nutze dies, sobald die App Verkäufe empfangen oder Kaufabschlüsse verarbeiten soll.
---

# Digistore24-Abrechnung einrichten

Die gesamte Digistore-Anbindung liegt fertig in `lib/digistore/` und
`app/api/ipn/route.ts`. Du richtest die Abrechnung **selbst ein** — du erklärst
sie dem Nutzer nicht bloß. Die Integration schreibst du nicht neu.

## Du machst das — nicht der Nutzer

Die Befehle unten rufst **du** über dein Bash-Tool auf. Sag dem Nutzer *nicht*,
er solle `make …` oder `! make …` tippen — die meisten Nutzer sind keine
Entwickler und wissen damit nichts anzufangen.

**Sag niemals, du könntest den API-Key oder die Produkte „nicht für den Nutzer
beschaffen".** Das ist falsch: Genau dafür sind die Befehle da.

- **API-Key besorgen** → du rufst `make ds24-connect` auf (holt den Key des
  Betreibers und schreibt ihn in die `.env`).
- **Produkte + IPN anlegen** → du rufst `make ds24-sync ARGS=--apply` auf (legt
  die Tarife aus `config/digistore-products.json` bei Digistore24 an, schreibt die
  `productId` zurück und registriert die IPN-Anbindung per API). Produkt-IDs sind
  **nichts, was der Nutzer beschaffen muss** — die App bringt die Tarife mit, das
  Skript erzeugt die IDs.

Der **einzige** Schritt, der zwingend beim Nutzer bleibt, ist ein Klick: die
Freigabe im Browser bei Digistore24 (die Autorisierung selbst — die kann kein
Tool für ihn wegklicken). Alles andere machst du.

## So funktioniert die Abrechnung

Digistore24 ist der Bezahl-Anbieter. Deine App wickelt kein Geld ab, sondern
**reagiert auf Ereignisse** von Digistore24:

- Kauf → IPN-Event `on_payment` → neue Zeile in `orders` mit Status `paid`.
- Rückerstattung/Chargeback/verpasste Abo-Zahlung → Status wird aktualisiert.
- Jede Order ist über `ds24OrderId` eindeutig (idempotent).

## Einrichtungs-Schritte (führe den Nutzer hier durch)

Die Zugangsdaten werden **im Terminal** geholt, nicht in der App. Es gibt bewusst
keine Oberfläche, um einen Schlüssel einzugeben oder zu erzeugen.

1. **API-Key verbinden.** **Führe `make ds24-connect` selbst aus** (dein
   Bash-Tool) — bitte den Nutzer *nicht*, `! make ds24-connect` zu tippen. Die
   meisten Nutzer sind keine Entwickler und wissen mit so einem Befehl nichts
   anzufangen; deine Aufgabe ist, ihn für sie laufen zu lassen.

   So gehst du vor:
   - Sag dem Nutzer **vorher** in einem Satz, was gleich passiert: „Ich stelle
     jetzt die Verbindung zu Digistore24 her. Gleich öffnet sich dein Browser —
     melde dich dort bei Digistore24 an und bestätige den Zugriff. Den Rest
     mache ich."
   - Ruf dann `make ds24-connect` auf. Wähle ein **großzügiges Timeout (10
     Minuten / 600000 ms)**, denn das Skript wartet, bis der Nutzer im Browser
     freigegeben hat (bis zu 5 Min).
   - Das Skript startet einen kurzlebigen lokalen Server, öffnet die
     Freigabeseite, fängt die Rückleitung ab und holt den Key. Es schreibt
     `DIGISTORE_API_KEY` in die `.env` — dazu `DIGISTORE_IPN_PASSPHRASE`, sofern
     Digistore24 sie mitliefert. Für Checkout-Links wird ein **`writable`**-Key
     benötigt (Standard-Anforderung des Skripts).
   - Öffnet sich **kein** Browser (Headless/Remote), gibt das Skript die URL im
     Text aus — reich sie dem Nutzer zum Anklicken weiter.
   - Ist der Aufruf mit `✓ DIGISTORE_API_KEY in .env gespeichert` durch, bestätige
     das dem Nutzer und mach mit Schritt 2 weiter.

   - Digistore24 akzeptiert `localhost` nicht als `return_url` — auch nicht als
     `site_url`. Deshalb läuft beides über die öffentliche Relay-Domain
     (`https://digistore24-app-template.com/connect/return?port=53682&path=/callback`),
     die den Browser auf `http://127.0.0.1:<port>/callback` weiterleitet. Das
     Relay sieht den API-Key nie. Überschreibbar per `DIGISTORE_CONNECT_RELAY`;
     `--no-relay` nutzt direkt localhost (nur auf Test-Hosts).
   - Flags: `--print` zeigt den Key nur an, ohne ihn zu speichern; `--port <n>`
     wählt einen anderen lokalen Callback-Port. `--manual` fragt nach einem selbst
     angelegten Key (Digistore24 → Einstellungen → API) — das braucht eine
     Tastatureingabe und ist der **Notweg**, wenn der Nutzer den Befehl selbst im
     Terminal fährt; du selbst nutzt immer den automatischen Weg (ohne `--manual`).
2. **Produkte und IPN anlegen.** **Führe `make ds24-sync ARGS=--apply` selbst
   aus.** Ein Befehl, idempotent, erledigt beides:
   - **Produkte:** liest die Tarife aus `config/digistore-products.json` (die
     Source of Truth, die auch `/tarife` speist), legt jeden bei Digistore24 an
     bzw. aktualisiert ihn und schreibt die `productId` in die Config zurück.
   - **IPN-Anbindung:** registriert den Webhook `…/api/ipn` **per API** direkt bei
     Digistore24 (`ipnSetup`) — der Nutzer muss dazu **nichts** in der
     DS24-Oberfläche eintragen. Die SHA512-Passphrase wird dabei erzeugt und als
     `DIGISTORE_IPN_PASSPHRASE` in die `.env` geschrieben; eine stabile
     `DIGISTORE_IPN_DOMAIN_ID` hält die Anbindung über Läufe hinweg idempotent.

   Braucht nur den `DIGISTORE_API_KEY` aus Schritt 1, keinen Browser, keine
   Nutzereingabe. Ohne `--apply` ist es ein Dry-Run (zeigt nur den Plan).

   - **IPN braucht eine öffentliche https-URL** (Digistore24 ruft sie prüfend
     auf — localhost geht nicht). Der IPN-Teil richtet sich nach `APP_URL`:
     - Ist `APP_URL` eine öffentliche https-Domain (live, oder lokal mit
       laufendem `make tunnel` und der Tunnel-URL als `APP_URL`), wird die IPN
       eingerichtet.
     - Sonst (reine lokale Entwicklung) **überspringt** der Befehl den IPN-Teil
       mit einem Hinweis und legt nur die Produkte an — die IPN kommt beim
       `go-live` dran, wenn die App öffentlich erreichbar ist. Das ist kein
       Fehler, sag dem Nutzer einfach, dass die IPN später eingerichtet wird.
   - Preise gehören **nicht** ans DS24-Produkt: Die API verwirft `data[amount]`,
     und Bezahlpläne lassen sich per API nicht anlegen. `priceCents` und
     `billingInterval` gehen stattdessen beim Checkout als `payment_plan[...]`
     mit (`lib/digistore/buyUrl.ts`). In der DS24-Oberfläche sind also **keine**
     Bezahlpläne nötig.
   - Passt die mitgelieferte Tarif-Liste noch nicht zum Produkt des Nutzers,
     bearbeite zuerst `config/digistore-products.json` (ein Eintrag je Tarif),
     dann sync. Lege keine zweite Preisliste im Code an.
3. **Verbindung prüfen:** Sobald die IPN eingerichtet ist, kann der Nutzer in
   Digistore24 „Verbindung testen“ auslösen. Ein gültig signierter IPN wird mit
   `200` beantwortet; bei ungültiger Signatur kommt `403`, ohne angelegten
   Betreiber-Benutzer (`role = "owner"`) `503`.

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
`scripts/ds24/` (Node ESM, Dry-Run per Default, `--apply` zum Ausführen). Die
beiden gängigen laufen bequem über `make` (siehe Schritte oben):

- **Produkte + IPN (Regelfall):** `make ds24-sync ARGS=--apply`. Synchronisiert
  die gesamte Tarif-Liste aus `config/digistore-products.json` (idempotent,
  schreibt die `productId` zurück) **und** registriert die IPN-Anbindung per API
  (`ipn-setup.mjs --auto`, nur bei öffentlicher `APP_URL`). Das ist der Weg aus
  Schritt 2 — nutze ihn.
- **Einzelnes Produkt (Sonderfall):** `node scripts/ds24/create-product.mjs
  --saas "…" --tarif "…" --apply`. Nur nötig, wenn du gezielt ein einziges
  Produkt außerhalb der Registry anlegen willst; im Normalfall nimm `ds24-sync`.
- **IPN einzeln (Sonderfall):** `make ds24-ipn ARGS="--url
  https://DEINE-DOMAIN/api/ipn --domain 'DEINE-DOMAIN' --apply"` (idempotent über
  die `domain_id`). Nötig nur, wenn du die IPN gezielt außerhalb von `ds24-sync`
  oder mit einer festen URL/domain einrichten willst. DS24 erzeugt dabei die
  SHA512-Passphrase → wird als `DIGISTORE_IPN_PASSPHRASE` in die `.env`
  geschrieben, oder gib eine bestehende via `--passphrase` mit. Voraussetzung:
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
- **API-Key & Passphrase sind Secrets.** Sie liegen in der `.env` (in
  STAGING/PROD in der Secret-Verwaltung des Hosters) und werden ausschließlich
  über `lib/digistore/settings.ts` gelesen — nie im Code, im Repo oder in Logs.
  `ds24ApiKey()` wirft, wenn der Key fehlt; kein stiller Fallback.
- Feld-Referenz (IPN-Payload, Events, createBuyUrl-Parameter): siehe
  `docs/DEPLOY.md` und die Kommentare in `lib/digistore/`.
