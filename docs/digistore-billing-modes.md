# Abrechnungs-Modelle: Abos + Prepaid-Token

Neben einmaligen Käufen (`createBuyUrl`, siehe `digistore-createbuyurl.md`) unter-
stützt das Template zwei weitere Modelle, einzeln oder **kombiniert**:

1. **Abo mit fester Zahlung** — monatlich/jährlich wiederkehrend.
2. **Verbrauchsabrechnung mit Prepaid-Token** — der Kunde kauft Token-Pakete;
   Nutzung zieht Token ab; bei niedrigem Stand wird **automatisch nachgeladen**.

Ein typischer Zuschnitt: **Basis-Abo (fix) + verbrauchsbasierte Token für die
KI-Nutzung**. Beides läuft über denselben DS24-Account, IPN und Checkout.

Code:
- `config/digistore-products.json` — **Produkt-Registry** (Source of Truth): je
  Angebot ein DS24-Produkt; `productId` von `sync-products.mjs` zurückgeschrieben.
- `lib/digistore/products.ts` — Registry-Zugriff + **`productBuyUrl`** (Checkout
  über Produkt-Link, **statt** createBuyUrl).
- `lib/digistore/billing.ts` — `createBillingOnDemand`, `stopRebilling`,
  `getPurchase`, `listPurchases`.
- `lib/tokens/packages.ts` — Token-Pakete (aus der Registry, kind="token").
- `lib/tokens/account.ts` — Guthaben, Verbrauch, Gutschrift, Auto-Aufladen.
- `db/schema-tokens.ts` — `subscriptions`, `tokenAccounts`, `tokenLedger`.
- IPN: `app/api/ipn/route.ts` (Gutschrift + Abo-Upsert).
- Scripts: `scripts/ds24/sync-products.mjs` (anlegen/aktualisieren),
  `scripts/ds24/request-approval.mjs` (Freigabe im Go-Live).

## Produkte: Registry + Checkout über Produkt-Links

Jedes Angebot (Abo-Tarif **und** Token-Paket) ist **ein DS24-Produkt** mit stabiler
`productId`. Deklariere Produkte in `config/digistore-products.json` und lege sie an:

```bash
DIGISTORE_API_KEY=... node scripts/ds24/sync-products.mjs --apply
```

Das Skript schreibt die `productId`(s) in die Config zurück. **Preis/Intervall**
werden je Produkt als **DS24-Payment-Plan** gepflegt (in der DS24-Oberfläche) — der
Preis lässt sich nicht per API am Produkt setzen (`data[amount]` ist deprecated).

Checkout ohne createBuyUrl — direkt über den Produkt-Link:

```ts
import { productBuyUrl } from "@/lib/digistore/products";
import { tokenCustomMarker } from "@/lib/tokens/packages";

// Abo:
const url = productBuyUrl("basis_monatlich", { email });
// Token-Paket (custom-Marker für die spätere Gutschrift):
const tokenUrl = productBuyUrl("pro", { email, custom: tokenCustomMarker("pro") });
// -> url dem Käufer öffnen. Alle Umgebungen nutzen dieselbe Live-productId.
```

---

## 1. Prepaid-Token: nachkaufen & auto-aufladen (`createBillingOnDemand`)

`createBillingOnDemand` bucht gegen eine **bestehende `purchase_id`** eine weitere
Zahlung ab — die Zahlungsmethode des Kunden ist bereits autorisiert, es ist **kein
neuer Checkout** nötig. Genau das trägt den Token-Nachkauf und das Auto-Aufladen.

### Voraussetzungen

- **writable-API-Key** und im DS24-Konto das Recht **„billing on demand"**.
- Eine **abbuchbare `purchase_id`**. Sie entsteht durch:
  - ein **Abo** (jede Abo-`purchase_id` ist abbuchbar), oder
  - einen Kauf, dessen **Payment-Plan Rebilling erlaubt** (im DS24-Produkt-Payment-
    Plan aktivieren) — so bleibt die Zahlungsmethode für spätere On-Demand-Buchungen
    hinterlegt.
- **DS24-Limits:** 10 Buchungen/Tag und 1/Minute je `purchase_id` (Produktion).

### Ablauf (wichtig: Gutschrift erst per IPN)

```
Kunde hat purchase_id ──▶ createBillingOnDemand(apiKey, {purchaseId, productId,
                                                  priceCents, custom:"tokens:pro"})
      │                         (bucht ab; schreibt NICHT gut)
      ▼
DS24 verarbeitet Zahlung ──▶ IPN on_payment (custom = "tokens:pro")
      ▼
IPN-Handler ──▶ creditTokens(...)  (idempotent über order_id → Guthaben +credits)
```

Die Gutschrift passiert **nie synchron** in `createBillingOnDemand`, sondern erst,
wenn DS24 die Zahlung per IPN bestätigt — exakt wie bei einem normalen Kauf. Der
`custom`-Marker `tokens:<paketSchlüssel>` verbindet Buchung und Gutschrift.

### Erst-Kauf eines Pakets (ohne On-Demand)

Für den **ersten** Kauf genügt der Produkt-Link mit dem custom-Marker:

```ts
import { productBuyUrl } from "@/lib/digistore/products";
import { tokenCustomMarker } from "@/lib/tokens/packages";

const url = productBuyUrl("pro", { email, custom: tokenCustomMarker("pro") });
// -> dem Käufer öffnen. Für spätere Auto-Aufladung muss der Payment-Plan des
//    Produkts in DS24 Rebilling erlauben.
```

Der IPN schreibt die Credits gut **und** merkt sich die `purchase_id` am
Token-Konto (`linkPurchaseId`) — Grundlage fürs spätere Auto-Aufladen.

### Auto-Aufladen

Konto konfigurieren und danach bei Bedarf auslösen:

```ts
import { setAutoReload, consumeTokens, autoReloadIfNeeded } from "@/lib/tokens/account";

// Einmalig (z. B. im Kunden-Dashboard):
await setAutoReload({
  userId: vendorId, buyerEmail: email,
  enabled: true, threshold: 500,      // nachladen, sobald ≤ 500 Token
  packageKey: "pro", ds24PurchaseId,  // welches Paket, welche purchase_id
});

// Bei jeder Nutzung:
await consumeTokens({ userId: vendorId, buyerEmail: email, amount: 42 });
await autoReloadIfNeeded({ userId: vendorId, buyerEmail: email, apiKey });
```

`autoReloadIfNeeded` prüft die Schwelle, holt **atomar einen Lock**
(`claimReloadSlot` → verhindert Doppelabbuchung bei parallelen Requests) und ruft
`createBillingOnDemand`. Gutschrift + Lock-Freigabe erfolgen im IPN. Schlägt die
Abbuchung fehl, wird der Lock sofort freigegeben. Alternativ **per Cron** über alle
Konten mit niedrigem Guthaben iterieren (robuster als der Inline-Aufruf).

### Verbrauch abrechnen

`consumeTokens` läuft in einer Transaktion mit Row-Lock (`FOR UPDATE`) und wirft
`InsufficientTokensError`, wenn das Guthaben nicht reicht — davor mit
`hasSufficientBalance` prüfen und ggf. zum Nachkauf leiten. Jede Buchung landet im
`tokenLedger` (Audit).

---

## 2. Abo-Verwaltung (Kündigen · Bezahldaten · Rechnungen)

Der IPN pflegt je Abo eine Zeile in `subscriptions` (Status, Intervall und die von
DS24 gelieferten Verwaltungs-Links). Im Kunden-Dashboard bietest du damit an:

| Funktion | Umsetzung |
|----------|-----------|
| **Status/Intervall** | `subscriptions.status` (`active`/`paused`/`cancelled`) + `billingInterval` (`1_month`/`12_month`). |
| **Kündigen** | `stopRebilling(apiKey, ds24PurchaseId)`. Zugang bleibt bis Periodenende (DS24 sendet `last_paid_day`). Alternativ dem Kunden `rebillingStopUrl` verlinken. |
| **Bezahldaten ändern** | **Keine API** — den DS24-Link `renewUrl` verlinken (Kunde aktualisiert dort seine Zahlungsdaten). |
| **Rechnungen ansehen** | `invoiceUrl` je Zahlung; Historie über `listPurchases(apiKey, { email })`. |

Fehlen Links im IPN-Payload, mit `getPurchase(apiKey, purchaseId)` nachladen.

```ts
import { stopRebilling } from "@/lib/digistore/billing";
import { ds24ApiKey } from "@/lib/digistore/settings";
// Kündigung nach Bestätigung durch den eingeloggten Kunden:
await stopRebilling(ds24ApiKey(), sub.ds24PurchaseId);
// Der IPN setzt subscriptions.status später auf 'cancelled'.
```

---

## Regeln

- **Gutschrift nur über den IPN.** Nie im `createBillingOnDemand`-Aufruf direkt
  gutschreiben — sonst wird bei fehlgeschlagener Zahlung fälschlich gutgeschrieben.
- **Idempotenz.** Gutschriften sind über `(accountId, ds24OrderId)` eindeutig; ein
  doppelter IPN bucht nicht erneut.
- **Lock gegen Doppelabbuchung.** Auto-Aufladen immer über `claimReloadSlot`.
- **Signaturprüfung (SHA512) bleibt Pflicht** — der IPN-Handler ist fail-closed.
- **Writable-Key & Passphrase sind Secrets** (liegen in der `.env` bzw. in der
  Secret-Verwaltung des Hosters, gelesen über `lib/digistore/settings.ts`).
- Bei Änderungen an dieser Abrechnungslogik zuerst den Skill **`guardrails`** lesen.
