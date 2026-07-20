---
name: billing-modes
description: Richtet die Abrechnungs-Modelle jenseits des Einmalkaufs ein — feste Abos (monatlich/jährlich), verbrauchsbasierte Prepaid-Token mit Auto-Aufladen (createBillingOnDemand) sowie die Abo-Selbstverwaltung für Kunden (Kündigen, Bezahldaten ändern, Rechnungen ansehen). Nutze dies nach setup-digistore, wenn die App wiederkehrend oder nach Verbrauch abrechnen soll (z. B. Token für KI-Nutzung).
---

# Abrechnungs-Modelle: Abos & Prepaid-Token

Voraussetzung: **`setup-digistore` ist erledigt** (API-Key, IPN, Checkout stehen).
Dieser Skill baut darauf auf. Der Code liegt fertig in `lib/digistore/billing.ts`,
`lib/tokens/` und `db/schema-tokens.ts` — deine Aufgabe ist, den Vendor durch
Auswahl und Konfiguration zu führen, **nicht** die Abrechnung neu zu schreiben.

Vollständige Referenz mit Code-Beispielen: **`docs/digistore-billing-modes.md`**.

## Schritt 1 — Abrechnungs-Modell wählen

Frag den Vendor, wie abgerechnet werden soll (Mehrfachauswahl möglich):

| Modell | Wann | Was es braucht |
|--------|------|----------------|
| **Fixes Abo** (monatl./jährl.) | planbarer Zugang, Mitgliedschaft | Abo-Tarif(e) + Abo-Verwaltung |
| **Prepaid-Token** (Verbrauch) | KI-Nutzung, API-Calls, „pay per use" | Token-Pakete + Verbrauchslogik + Auto-Aufladen |
| **Beides kombiniert** | Basis-Abo + Verbrauch obendrauf | beide Bausteine |

Ein sehr häufiger Zuschnitt für KI-Apps: **kleines Basis-Abo + Token nach Verbrauch**.

## Schritt 2 — Produkte anlegen (Registry)

Jedes Angebot (Abo-Tarif **und** Token-Paket) ist **ein Digistore24-Produkt**.
Deklariere sie in **`config/digistore-products.json`** (`kind`, Name, Beschreibung,
für Abos `billingInterval`, für Token `credits`/`priceCents`). Dann anlegen:

```bash
DIGISTORE_API_KEY=... node scripts/ds24/sync-products.mjs --apply
```

Das schreibt die `productId`(s) in die Config zurück. Danach **je Produkt in DS24
einen Payment-Plan** (Preis/Intervall) anlegen — der Preis lässt sich nicht per API
setzen (`data[amount]` deprecated). Alle Umgebungen nutzen dieselben Live-Produkte
(siehe `docs/environments.md`).

Checkout läuft über den **Produkt-Link** (`productBuyUrl(key, { email })` aus
`lib/digistore/products.ts`), **nicht** über createBuyUrl.

## Schritt 3 — Fixes Abo (falls gewählt)

Tarif als Produkt mit `kind: "subscription"` + `billingInterval` (`"1_month"` /
`"12_month"`, real im DS24-Payment-Plan). Checkout: `productBuyUrl("basis_monatlich",
{ email })`. Der IPN pflegt Status und Verwaltungs-Links in die Tabelle
**`subscriptions`**.

Baue im Kunden-Dashboard die **Abo-Selbstverwaltung**:
- **Status/Intervall** anzeigen (`subscriptions.status`, `billingInterval`).
- **Kündigen** → `stopRebilling(apiKey, ds24PurchaseId)` (nach Bestätigung durch den
  eingeloggten Kunden). Zugang bleibt bis Periodenende.
- **Bezahldaten ändern** → DS24-Link `renewUrl` verlinken (keine eigene API).
- **Rechnungen** → `invoiceUrl` je Zahlung; Historie via `listPurchases`.

## Schritt 4 — Prepaid-Token (falls gewählt)

1. **Pakete** sind Produkte mit `kind: "token"` in der Registry (`credits`,
   `priceCents`) — via `sync-products.mjs` angelegt (Schritt 2).
2. **Kauf**: `productBuyUrl(key, { email, custom: tokenCustomMarker(key) })`. Für
   späteres Auto-Aufladen muss der Payment-Plan des Produkts in DS24 **Rebilling
   erlauben**.
3. **Gutschrift**: passiert automatisch im IPN (`creditTokens`, idempotent) —
   nichts synchron gutschreiben.
4. **Verbrauch**: `consumeTokens(...)` bei jeder Nutzung (transaktional, wirft bei
   zu wenig Guthaben `InsufficientTokensError`). Vorher `hasSufficientBalance`.
5. **Auto-Aufladen**: `setAutoReload({ enabled, threshold, packageKey,
   ds24PurchaseId })`, dann `autoReloadIfNeeded(...)` nach Verbrauch **oder** per
   Cron über alle Konten mit niedrigem Guthaben. Nutzt `createBillingOnDemand`
   gegen die hinterlegte `purchase_id`; Lock schützt vor Doppelabbuchung.

### So funktioniert die On-Demand-Abbuchung

`createBillingOnDemand` bucht gegen eine **bestehende `purchase_id`** ab (kein neuer
Checkout). Voraussetzung: writable-Key + DS24-Recht „billing on demand" + eine
abbuchbare purchase_id (Abo **oder** ein Kauf mit rebilling-fähigem Payment-Plan).
DS24-Limit: 10 Buchungen/Tag, 1/Minute je purchase_id.

## Schritt 5 — Tests & Datenbank

- Schema übernehmen: `make db-migrate` (die Migration für
  `subscriptions`/`token_accounts`/`token_ledger` liegt bereits in `drizzle/`).
  Eigene Schemaänderungen vorher mit `make db-generate` in eine Migration gießen.
- **Tests schreiben** für deine Abrechnungs-Regeln (Vorbilder: `lib/tokens/
  tokens.test.ts`, `lib/digistore/billing.test.ts`). `npm run typecheck && npm run
  test` müssen grün sein.

## Nächster Schritt

Wenn die Abrechnung steht, vor dem Launch der Reihe nach: **`security-gateway`** →
**`performance-gateway`** → **`compliance-check`** → **`go-live`** →
**`go-to-market`**.

## Wichtige Regeln

- **Gutschrift ausschließlich über den IPN.** Ein `createBillingOnDemand`-Aufruf
  schreibt **nie** direkt gut — sonst wird bei fehlgeschlagener Zahlung fälschlich
  Guthaben gebucht.
- **Idempotenz & Lock sind Pflicht.** Gutschriften sind über `(accountId,
  ds24OrderId)` eindeutig; Auto-Aufladen läuft nur über `claimReloadSlot`.
- **Signaturprüfung (SHA512) niemals abschalten** — der IPN-Handler ist fail-closed.
- **Kein Mock-/Demo-Fallback** bei DS24-API-Fehlern — Fehler werfen.
- **Bei Änderungen an der Abrechnungslogik zuerst `guardrails` lesen** (STOPP-Kriterium).
