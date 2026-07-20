# Checkout-Links mit `createBuyUrl`

Die App erzeugt Checkout-URLs zur Laufzeit über die Digistore24-Funktion
`createBuyUrl` und schickt dabei einen **kompletten Custom Payment Plan** mit —
Preis, Währung und Intervall bestimmt also die App, nicht das Digistore-Produkt.
Pro Angebot genügt **ein** Basisprodukt in Digistore24.

Implementierung: `lib/digistore/buyUrl.ts`.

## Verwendung

```ts
import { getOrCreateBuyUrl } from "@/lib/digistore/buyUrl";
import { ds24ApiKey, getOwnerUserId } from "@/lib/digistore/settings";

const userId = await getOwnerUserId();       // Betreiber (role = "owner")
if (!userId) throw new Error("Kein Betreiber-Benutzer angelegt");

const url = await getOrCreateBuyUrl({
  apiKey: ds24ApiKey(),                // writable-Key nötig (aus der .env)
  userId,                              // Betreiber = Cache-Namespace
  offer: {
    key: "gold",                       // stabiler Angebots-Schlüssel
    productId: "123456",               // DS24-Basisprodukt
    priceCents: 900,                   // 9,00 €
    currency: "EUR",
    billingInterval: "1_month",        // weglassen = Einmalzahlung
    title: "Paid Challenge - Gold",    // Platzhalter {TARIF} auf der Checkout-Seite
    description: "Gold-Tarif (monatlich)",
  },
  thankyouUrl: `${appUrl}/optin/[ORDER_ID]`, // DS24 ersetzt [ORDER_ID]/[BUYER_EMAIL]
});
// -> url dem Käufer öffnen (Link/Redirect)
```

## Caching (wichtig)

- URLs werden pro `(userId, offer.key)` in der Tabelle `buy_url_cache` gecacht,
  **TTL 20h** (Sicherheitspuffer unter der 24h-Gültigkeit der DS24-URL).
- **Ändert sich das Angebot** (Preis, Intervall, Titel, Thank-You-URL …), ändert
  sich der `offerHash` → es wird automatisch eine **neue URL** erzeugt.
- **Nutzerspezifische URLs werden nie gecacht**: Sobald `buyer`, `affiliate`,
  `campaignKey`, `trackingKey` oder `upgradeOrderId` gesetzt ist, wird jedes Mal
  frisch erzeugt.

## Regeln (aus der Referenzimplementierung)

- Bracket-Notation für verschachtelte Parameter (`payment_plan[first_amount]`).
- Preis als Euro-String mit Punkt (`"9.00"`), nicht in Cent, nicht mit Komma.
- `number_of_installments = 0` bedeutet **unbegrenztes Abo** (nicht „keine Zahlung").
- Thank-You-URL muss **HTTPS** sein, sonst lehnt Digistore ab.
- API-Basis über `DIGISTORE_URL` (`https://www.digistore24.com`).
- Bei ungültigem Affiliate-Code wird einmal **ohne** Affiliate wiederholt.
