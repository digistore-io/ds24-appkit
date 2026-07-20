---
name: build-app
description: DER EINSTIEGSPUNKT für dieses Template — nutze diesen Skill, sobald der Nutzer mit dem Bauen anfangen will, sich orientieren will oder unklar formuliert loslegt ("wie fange ich an?", "Baue meine App", "was kann ich hier machen?"). Klärt zuerst, ob eine Produktidee da ist (sonst Übergabe an market-research), ordnet das Vorhaben einem Archetyp zu, legt Datenmodell und Seiten an und reicht danach an setup-digistore für die Bezahlung weiter. Begleitend gelten die Regeln aus guardrails.
---

# Eine SAAS-App auf diesem Template bauen

Du baust eine **SAAS-Anwendung, die über Digistore24 abrechnet**. Dieses Template
liefert Login, Datenbank, Design-System und die komplette Digistore-Anbindung
bereits mit. Du beschreibst nur noch, was deine App tun soll.

**Ausnahmslos eine SAAS-App — niemals eine einzelne Webseite.** Landingpage,
Onepager, Firmen- oder Portfolioseite sind hier kein gültiges Ergebnis: ohne
Nutzerkonten, geschützten Bereich und kaufabhängigen Zugang gibt es nichts, was
Digistore24 abrechnen könnte. Fragt der Nutzer danach, frag zurück, was die
Leute *kaufen* und danach *benutzen* sollen — die gewünschte Seite ist fast
immer die Verkaufsseite der App und gehört als `app/page.tsx` plus
`app/tarife/page.tsx` hinein, nicht als eigenes Projekt daneben. Details in
`CLAUDE.md` („Was hier entsteht — ausnahmslos").

**Ausnahme: Test-Apps.** Will jemand nur ausprobieren („zeig mir ‚Hello
World'", eine kleine Seite zum Gefühl-Bekommen), dann bau das direkt als Seite
unter `app/` — ohne Schritt 0, ohne `market-research`, ohne Nachfrage nach dem
Produkt. Erst wenn es läuft, in einem Satz anbieten, ob daraus etwas Verkaufbares
werden soll. Anbieten, nicht drängen.

## Schritt 0 — Die Weiche: Steht die Idee schon?

Dies ist die **einzige Eingangstür** des Templates. Der Nutzer muss keinen
zweiten Skill kennen — du stellst zuerst genau eine Frage:

> „Hast du schon eine konkrete Idee, was deine App tun soll — oder sollen wir
> gemeinsam eine finden, die zu deiner Erfahrung und deiner Reichweite passt?"

- **Idee steht** (der Nutzer kann in 1–2 Sätzen sagen, was die App tut und für
  wen) → weiter bei Schritt 1.
- **Keine oder vage Idee** („weiß nicht", „irgendwas mit…", nur eine Branche) →
  starte den Skill **`market-research`**. Er interviewt den Nutzer zu Expertise
  und Reichweite, recherchiert eine Zielgruppe samt Herausforderungen und liefert
  einen konkreten Produktvorschlag + Product-Brief (`docs/product-brief.md`).
  Danach kommt der Nutzer hierher zurück, und du machst bei Schritt 1 weiter.

Rate nicht. Eine vage Antwort ist ein Nein — lieber einmal zu oft in die
Recherche abbiegen als eine App bauen, die niemand kauft.

- **Nur ausprobieren** („Hello World", eine kleine Testseite) → die Frage
  entfällt. Direkt bauen, siehe „Ausnahme: Test-Apps" oben. Eine Weiche vor
  einen Zweizeiler zu stellen, vertreibt genau die Nutzer, die das System
  gerade erst kennenlernen.

Wenn der Nutzer sich nur **orientieren** will („was kann ich hier machen?",
„wie fange ich an?"), gib ihm kurz den Weg (Idee → Bauen → Bezahlung →
Sicherheit → Recht → Live → Vermarktung, siehe `README.md`) und stell dann
dieselbe Frage.

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
- Danach eine **Migration** erzeugen und einspielen: `make db-generate` →
  erzeugte Datei in `drizzle/` prüfen → `make db-migrate`. Die Migration gehört
  mit in den Commit (siehe `docs/database.md`). Kein `db:push`.

## Schritt 3 — Seiten & Logik

- Geschützte Seiten unter `app/dashboard/…` (bereits per `middleware.ts` abgesichert).
- Öffentliche Käufer-Seiten (z. B. Zugang nach Kauf) prüfen den `orders.status`.
- UI mit shadcn/ui: `npx shadcn@latest add <component>`. Farben nur über Tokens
  aus `app/globals.css`, nichts hart kodieren.
- Meldungen (Hinweis/Erfolg/Warnung/Fehler) immer über `Callout`
  (`components/ui/callout.tsx`, Varianten `info` | `success` | `warning` |
  `danger`) — keine eigenen Farbklassen. Details in `CLAUDE.md`.
- Jede Seite muss in Hell **und** Dunkel lesbar sein; die App hat einen
  Umschalter (Standard: System). Mit Tokens ergibt sich das von allein.

## Schritt 3b — Betreiber-/Admin-Account anlegen

Damit sich der Nutzer selbst als **Betreiber (Admin)** einloggen kann, lege einen
`owner`-Account an. **Frag den Nutzer nach seiner E-Mail-Adresse** (die, mit der er
sich später einloggt) und lege den Account per CLI an — sobald die DB läuft
(`make start`):

```bash
node scripts/users/create-user.mjs --email <seine-mail> --role owner --apply
# oder: make user-create ARGS="--email <seine-mail> --role owner --apply"
```

Der Login ist passwortlos (E-Mail-Magic-Link) — der vorab angelegte `owner`-Account
wird beim ersten Login wiederverwendet. Admin-only-Seiten mit `requireOwner()`
(`lib/authz.ts`) schützen; Vorbild: `app/dashboard/admin/page.tsx`. Normale Kunden
bleiben `member` (Default). Details: `scripts/users/README.md`.

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

### Und dann: die App selbst aufrufen

**Melde niemals „fertig", ohne die Seiten geöffnet zu haben.** Grüne Tests und
ein erfolgreicher Build schließen einen „Internal Server Error" nicht aus —
`vitest` rendert nicht, `npm run build` läuft ohne Datenbank und ohne echte
`.env`. Genau dort entsteht der Fehler, den der Nutzer dann als Erstes sieht.

```bash
make start                # DB + Migrationen + App
make smoke                # ruft jede Seite auf, meldet Serverfehler
```

5xx heißt: beheben, bevor du weitermachst — Ursache mit `make logs`. Ein 307 auf
`/login` ist bei geschützten Seiten korrekt. Dynamische Seiten (`[id]`)
überspringt `make smoke`; die einmal von Hand mit einem echten Datensatz
aufrufen.

Sag dem Nutzer erst dann, dass er schauen kann — und schreib dazu, was er
sehen wird und unter welcher Adresse.

## Schritt 5 — Bezahlung anschließen

Führe den Skill **`setup-digistore`** aus. Er verbindet Produkt-ID, API-Key,
IPN-Webhook und Checkout-Link. Der IPN-Handler (`app/api/ipn/route.ts`)
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
- **Keine Secrets/API-Keys im Code.** Immer `.env` (Digistore24-Key per
  `make ds24-connect`); keine Eingabefelder für Schlüssel in der App.
- **Bei Geld, Kundendaten, neuen externen Systemen:** erst den Skill `guardrails`
  lesen und im Zweifel stoppen.
