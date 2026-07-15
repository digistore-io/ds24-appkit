---
name: build-app
description: Start hier, wenn du auf diesem Template eine SAAS-Anwendung mit Digistore24-Abrechnung baust. Ordnet dein Vorhaben einem Archetyp zu, legt Datenmodell und Seiten an und verweist auf setup-digistore für die Bezahlung sowie guardrails für die Sicherheitsregeln.
---

# Eine SAAS-App auf diesem Template bauen

Du baust eine **SAAS-Anwendung, die über Digistore24 abrechnet**. Dieses Template
liefert Login, Datenbank, Design-System und die komplette Digistore-Anbindung
bereits mit. Du beschreibst nur noch, was deine App tun soll.

## Schritt 0 — Noch keine klare Idee? Erst recherchieren

Wenn der Nutzer **noch keine konkrete Produktidee** hat (oder sie unsicher/vage
ist), starte zuerst den Skill **`market-research`**. Er interviewt den Nutzer zu
Expertise und Reichweite, recherchiert eine Zielgruppe samt Herausforderungen und
liefert einen konkreten Produktvorschlag + Product-Brief (`docs/product-brief.md`).
Erst danach hier weitermachen. Steht die Idee bereits fest, überspringe diesen Schritt.

## Schritt 1 — Archetyp wählen

Frag den Nutzer (oder überlege), was die App im Kern ist:

| Die App soll…                                   | Archetyp            | Was zu tun ist |
|-------------------------------------------------|---------------------|----------------|
| Digitale Inhalte/Kurse nach Kauf freischalten   | **Content-Access**  | Tabelle je „Produkt", Zugriff an `orders.status = 'paid'` koppeln |
| Nach Kauf wiederkehrende Nachrichten senden     | **Drip/Automation** | Zeitplan-Tabelle + Cron/Route, Start bei `on_payment` |
| Ein Tool/Feature nur für Käufer bereitstellen   | **Gated-Tool**      | Feature-Seiten hinter Kauf-Check |
| Mitgliedschaft/Abo verwalten                    | **Membership**      | `orders`-Status (paused/cancelled) → Zugriff steuern; Abo-Verwaltung via `billing-modes` |
| Nach Verbrauch abrechnen (z. B. KI-Nutzung)     | **Verbrauch/Token** | Prepaid-Token mit Auto-Aufladen — Skill `billing-modes` |

Alle Archetypen nutzen dieselbe Basis: **Auth (`auth.ts`)** + **`orders`-Tabelle**,
die durch Digistore-IPN-Events gefüllt wird.

## Schritt 2 — Datenmodell erweitern

- Neue Tabellen in `db/schema.ts` (bzw. eine eigene Datei, die dort re-exportiert
  wird — Vorbild: `db/schema-digistore.ts`).
- Verknüpfe kaufabhängige Inhalte mit `orders` (Feld `ds24ProductId` / `userId`).
- Danach: `npm run db:generate && npm run db:push`.

## Schritt 3 — Seiten & Logik

- Geschützte Seiten unter `app/dashboard/…` (bereits per `middleware.ts` abgesichert).
- Öffentliche Käufer-Seiten (z. B. Zugang nach Kauf) prüfen den `orders.status`.
- UI mit shadcn/ui: `npx shadcn@latest add <component>`. Farben nur über Tokens
  aus `app/globals.css`, nichts hart kodieren.

## Schritt 4 — Tests schreiben UND ausführen (Pflicht)

Für **jedes** Feature Tests schreiben und laufen lassen — nicht optional:
- **Datenlogik/Regeln** mit `vitest` testen (Vorbilder: `lib/digistore/ipn.test.ts`,
  `lib/digistore/buyUrl.test.ts`). Reine Logik ohne DB testen; DB-abhängige Fälle
  gegen die lokale Postgres.
- Typische Fälle: Zugriffsregeln (bezahlt → Zugang, nicht bezahlt → kein Zugang),
  Statuswechsel, Eingabe-Validierung, Rand-/Fehlerfälle.
- **Ausführen:** `npm run test` muss **grün** sein, bevor es weitergeht. Zusätzlich
  `npm run typecheck`. Die mitgelieferte CI (`.github/workflows/ci.yml`) führt beides
  bei jedem Push automatisch aus.

## Schritt 5 — Bezahlung anschließen

Führe den Skill **`setup-digistore`** aus. Er verbindet Produkt-ID, API-Key,
IPN-Webhook und Checkout-Link. Der IPN-Handler (`app/api/ipn/[vendor]/route.ts`)
schreibt Käufe automatisch in `orders` — den Code dafür nicht neu erfinden.

Rechnet die App **wiederkehrend (Abo) oder nach Verbrauch (Prepaid-Token)** ab,
danach den Skill **`billing-modes`** ausführen.

## Schritt 6 — Vor dem Launch: absichern, skalieren, rechtlich & live

Nacheinander:
1. **`security-gateway`** — App auf Sicherheitslücken scannen und beheben.
2. **`performance-gateway`** — sicherstellen, dass ~100 parallele Nutzer flüssig laufen.
3. **`compliance-check`** — Rechtsseiten (Impressum/Datenschutz/AGB/Widerruf) & DSGVO.
4. **`go-live`** — App online stellen und live verifizieren.
5. **`go-to-market`** — Positionierung, Kanäle, Launch-Plan und fertiger Content
   (Landingpage, E-Mails, Video-Skripte).

## Die goldenen Regeln (nicht dagegen arbeiten)

- **Login bleibt Pflicht** für alle App-Seiten (außer Start, Login, Opt-in, IPN).
- **Die IPN-Signaturprüfung niemals abschalten** (`lib/digistore/ipn.ts`).
- **Keine Secrets/API-Keys im Code.** Immer `.env` bzw. Onboarding-Eingabe.
- **Bei Geld, Kundendaten, neuen externen Systemen:** erst den Skill `guardrails`
  lesen und im Zweifel stoppen.
