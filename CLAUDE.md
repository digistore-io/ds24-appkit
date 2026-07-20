# Guardrails für diese App

Du (und jede KI-Assistenz) baust eine **SAAS-Anwendung mit Digistore24-Abrechnung**
auf diesem Template. Bleib auf dem goldenen Pfad. Reiß die Grundstruktur nicht heraus.

## Was hier entsteht — ausnahmslos

**Immer eine SAAS-Anwendung, die über Digistore24 abrechnet. Niemals eine
einzelne Webseite.** Das gilt ohne Ausnahme, auch wenn der Nutzer es anders
formuliert.

Der Unterschied ist nicht kosmetisch. Eine SAAS-App hat Nutzerkonten, einen
geschützten Bereich hinter dem Login, ein Datenmodell und einen Kauf, der
Zugang freischaltet — getragen von IPN-Events. Eine Landingpage, ein
Onepager, eine Portfolio- oder Firmenseite hat davon nichts und lässt sich
über Digistore24 auch nicht sinnvoll abrechnen. Wer das hier baut, hat am Ende
ein Template ohne Zweck und eine Abrechnung, die ins Leere läuft.

**Wenn der Nutzer nach einer reinen Webseite fragt** („bau mir eine
Landingpage", „ich brauche eine Seite für meine Firma"), dann nicht einfach
loslegen und auch nicht stumm ablehnen: Sag in einem Satz, dass dieses Template
für verkaufbare SAAS-Anwendungen gedacht ist, und frag nach dem Produkt
dahinter — was sollen die Leute *kaufen* und was können sie danach *benutzen*?
Meistens steckt eine Produktidee dahinter, und die Seite war nur als
Verkaufsseite gemeint. Die gehört dann als öffentliche Startseite in die App
(`app/page.tsx` + `app/tarife/page.tsx`), nicht als eigenes Projekt daneben.
Kommt dabei heraus, dass es wirklich nur um eine Webseite ohne Produkt geht,
ist dieses Template das falsche Werkzeug — sag das offen, statt etwas zu bauen,
das nicht trägt.

**Ausprobieren ist etwas anderes als bauen.** Viele fangen mit einer
Test-App an — „zeig mir einfach ‚Hello World'", eine Seite mit einer
Schaltfläche, irgendetwas Kleines, um ein Gefühl für das System zu bekommen.
Das ist ausdrücklich in Ordnung und **kein** Fall für die Regel oben: Bau das
Kleine einfach, ohne Rückfrage nach dem Produkt, ohne `market-research`, ohne
Vortrag über SAAS. Wer das System kennenlernt, ist noch nicht dabei, sein
Produkt zu bauen.

Zwei Dinge dabei:

- **Innerhalb der App bauen**, nicht daneben — also als Seite unter `app/`, mit
  der vorhandenen Struktur. Dann ist der Versuch später nicht im Weg, sondern
  einfach eine Seite, die man löscht oder umbaut.
- **Danach die Brücke schlagen.** Wenn es läuft, in einem Satz anbieten, was der
  nächste Schritt wäre — „soll daraus etwas werden, das du verkaufen kannst?
  Dann starte ich `build-app`". Anbieten, nicht drängen. Wer weiter
  herumprobieren will, darf das.

Kurz: Die Regel „immer SAAS" gilt für das, was der Nutzer **baut**, nicht für
das, womit er **spielt**.

## Zuerst: den Nutzer abholen

Die Menschen, die hier arbeiten, sind oft **keine Entwickler** und wissen beim
ersten Start nicht, was sie sagen sollen. Deshalb:

**Ist die App noch unverändert (Template-Zustand) und der Nutzer schreibt etwas
Unspezifisches** — „hallo", „was kann ich hier machen?", „wie fange ich an?",
„los geht's" — dann **antworte nicht mit einer Rückfrage ins Leere**, sondern
begrüße ihn kurz, nenne in einem Satz, was dieses Template ist, und **starte den
Skill `build-app`**. Der ist die einzige Eingangstür und klärt selbst, ob schon
eine Produktidee da ist (sonst übergibt er an `market-research`).

Kurz: Im Zweifel `build-app`. Der Nutzer muss keinen Skill-Namen kennen —
„Baue meine App" genügt, und auch weniger als das.

Es gibt geführte Skills in `.claude/skills/` — nutze sie in dieser Reihenfolge:
- **`market-research`** — wenn noch keine klare Idee da ist: Interview + Recherche
  → Zielgruppe, Herausforderungen und konkreter Produktvorschlag (Product-Brief).
- **`build-app`** — Einstiegspunkt: Archetyp wählen, Datenmodell + Seiten anlegen.
- **`setup-digistore`** — Abrechnung einrichten (API-Key, IPN, Checkout).
- **`billing-modes`** — *(optional)* Abos (monatl./jährl.) und/oder Prepaid-Token
  mit Auto-Aufladen einrichten + Abo-Selbstverwaltung (Kündigen/Bezahldaten/Rechnungen).
- **`security-gateway`** — vor dem Launch: Sicherheitslücken scannen und beheben.
- **`performance-gateway`** — sicherstellen, dass ~100 parallele Nutzer flüssig laufen.
- **`compliance-check`** — Rechtsseiten (Impressum/Datenschutz/AGB/Widerruf) & DSGVO.
- **`go-live`** — App online stellen und live verifizieren.
- **`go-to-market`** — Vermarktung: Positionierung, Kanäle, Launch-Plan, Content
  (Landingpage, E-Mails, Video-Skripte).
- **`guardrails`** — durchgehende Sicherheitsregeln (Geld/Secrets/Kundendaten).

Der komplette Weg (für den Nutzer möglichst einfach, jeder Schritt übergibt an den
nächsten):

**(0) Idee** `market-research` → **(1) Bauen** `build-app` → **(2) Bezahlung**
`setup-digistore` *(→ optional `billing-modes` für Abos/Prepaid-Token)* →
**(3) Sicherheit** `security-gateway` → **(4) Skalierung** `performance-gateway` →
**(5) Recht** `compliance-check` → **(6) Live** `go-live` → **(7) Vermarktung**
`go-to-market`. Begleitend: `guardrails`.

## Regeln

- **Login ist nicht optional.** Alle App-Seiten sind geschützt (siehe
  `middleware.ts` + `auth.ts`), außer Startseite, `/login`, `/optin/*` und dem
  IPN-Endpoint `/api/ipn` (der über die SHA512-Signatur abgesichert ist).
- **IPN-Signaturprüfung (SHA512) ist Pflicht.** `lib/digistore/ipn.ts` niemals
  abschalten. Order-Status nur über IPN-Events setzen.
- **Keine Secrets im Code.** Aus `process.env` lesen, neue Variablen in
  `.env.example` ergänzen. Die Digistore24-Zugangsdaten des Betreibers stehen in
  der Umgebung (`.env`, in STAGING/PROD in der Secret-Verwaltung des Hosters) und
  werden über `lib/digistore/settings.ts` gelesen — nicht aus der Datenbank.
- **Kein Mock-/Demo-Fallback** bei Digistore-API-Fehlern — Fehler werfen.
- **Datenbankänderungen nur per Migration.** Schema in `db/schema.ts` ändern,
  dann `make db-generate` → `make db-migrate`; die Datei in `drizzle/` wird
  eingecheckt und nach dem Einspielen nie mehr editiert. `db:push` nur gegen eine
  leere lokale DB, niemals gegen Staging/Produktion. Siehe `docs/database.md`.
- **Umgebungen sind verbindlich: DEV / STAGING / PROD** (`APP_ENV`). In
  STAGING und PROD ist der E-Mail-Versand **Pflicht** — fehlt er, startet die
  App nicht (`instrumentation.ts` → `lib/env-guard.ts`). Der Entwicklungs-Login
  (`lib/auth/dev-login.ts`, Anmeldung ohne Magic-Link) gilt **ausschließlich**
  in DEV, nur auf localhost und nur solange kein Mailversand konfiguriert ist.
  Diese Bedingungen niemals aufweichen — es ist ein Auth-Bypass. Unbekannte
  `APP_ENV`-Werte gelten bewusst als „production".
- **Design-System nutzen.** shadcn/ui + Tokens aus `app/globals.css`, keine
  hart kodierten Farben, keine eigene UI erfinden.
- **Meldungen immer als `Callout`.** Hinweise, Erfolgs-, Warn- und
  Fehlermeldungen gehen über `components/ui/callout.tsx` mit einer der vier
  Absichten `info` | `success` | `warning` | `danger` — **nie** mit selbst
  gewählten Farbklassen (`text-amber-900`, `bg-red-50`, …). Die Token-Paare
  dahinter sind in Hell **und** Dunkel auf Lesbarkeit geprüft; eigene
  Kombinationen kippen im jeweils anderen Modus regelmäßig ins Unlesbare.
  Für Status *im* Fließtext gibt es `text-success-foreground` &
  `text-danger-foreground`.

  ```tsx
  <Callout variant="warning" title="Kein Mailversand eingerichtet">
    Bis dahin meldet dich die App ohne Passwort an.
  </Callout>
  ```
- **Hell und Dunkel gelten beide.** Die App bringt einen Umschalter mit
  (System/Hell/Dunkel, `components/theme-toggle.tsx`); `System` ist der
  Standard. Jede neue Oberfläche muss in beiden Modi lesbar sein — das ergibt
  sich von selbst, solange Farben aus den Tokens kommen. `dark:`-Klassen folgen
  der `.dark`-Klasse am `<html>` (`@custom-variant` in `app/globals.css`).
- **Tests sind Pflicht.** Jedes Feature bekommt `vitest`-Tests (Vorbilder in
  `lib/digistore/*.test.ts`); `npm run test` und `npm run typecheck` müssen grün
  sein, bevor es weitergeht. Die CI (`.github/workflows/ci.yml`) führt sie bei
  jedem Push automatisch aus.
- **Die App selbst aufrufen, bevor du „fertig" sagst.** Siehe unten — grüne
  Tests sind kein Beweis, dass die Seite lädt.

## Niemals eine kaputte Seite abliefern

**Bevor du dem Nutzer sagst, dass etwas fertig ist, rufst du es selbst auf.**
Ohne Ausnahme. Der häufigste Fehler in diesem Template ist eine App, die der
Nutzer öffnet und die ihn mit „Internal Server Error" begrüßt — während der
Agent gemeldet hat, alles sei fertig.

Das passiert, weil grüne Tests und ein erfolgreicher Build das **nicht**
ausschließen. `vitest` prüft Logik ohne Rendering, `npm run build` prüft
Übersetzbarkeit ohne Datenbank und ohne echte `.env`. Ein fehlender
Umgebungswert, eine Abfrage auf eine Spalte, die die Migration nie angelegt
hat, ein `await` auf `params`, das vergessen wurde — all das kompiliert
sauber und fliegt erst beim ersten Aufruf.

Der Ablauf, wenn du eine Seite gebaut oder geändert hast:

```bash
make start                # DB + Migrationen + App
make smoke                # ruft JEDE Seite auf und meldet Serverfehler
```

`make smoke` (`scripts/dev/smoke.mjs`) findet die Seiten selbst unter `app/`
und wertet so:

- **5xx** → Fehler. Beheben, nicht wegdiskutieren, nicht als „bekanntes
  Problem" weiterreichen.
- **307 auf `/login`** → richtig so. Geschützte Seiten sollen umleiten.
- **2xx** → in Ordnung.

Bei einem Fehler steht die Ursache im Log: `make logs`. Dort steht der echte
Stacktrace; die Seite im Browser zeigt oft nur den nichtssagenden Satz.

Zwei Ergänzungen, die `make smoke` nicht leisten kann:

- **Dynamische Seiten** (`app/…/[id]/page.tsx`) überspringt es — ohne echte ID
  ist der Aufruf sinnlos. Solche Seiten rufst du einmal von Hand mit einem
  echten Datensatz auf.
- **Ein grüner Smoke-Test heißt „lädt", nicht „stimmt".** Ob der Inhalt
  richtig ist, sagt er nicht. Bei allem rund um Geld, Rollen und Kundendaten
  gehört der Blick auf die Seite selbst dazu.

## Ein Feature hinzufügen

1. Datenmodell in `db/schema.ts` erweitern → `make db-generate` (erzeugt eine
   Migration in `drizzle/`) → Datei prüfen → `make db-migrate`. Die Migration
   gehört mit in den Commit. Details: `docs/database.md`.
2. Geschützte Seite/Route unter `app/dashboard/…` bauen; kaufabhängige Inhalte an
   `orders.status` koppeln.
3. UI-Komponenten via `npx shadcn@latest add <component>`.
4. **Tests schreiben** (`vitest`) für die neue Logik/Regeln.
5. `npm run typecheck && npm run test` (grün) vor dem Deploy.
6. **`make start && make smoke`** — die neue Seite selbst aufrufen. Erst danach
   ist es fertig (siehe „Niemals eine kaputte Seite abliefern").

## Benutzer & Rollen

Die `users`-Tabelle hat ein `role`-Feld (`db/schema.ts`):
- **`owner`** — SAAS-Betreiber (Admin). Zugriff auf Admin-Bereiche.
- **`member`** — normaler Kunde (Default beim Selbst-Login per Magic-Link).

**Admin-Bereiche absichern:** In Server-Komponenten `requireOwner()` aus
`lib/authz.ts` als erste Zeile aufrufen (kein Login → `/login`, kein owner →
`/dashboard`). Vorbild: `app/dashboard/admin/page.tsx`. Für reine Prüfungen gibt
es `isOwner(role)` / `hasRole(role, [...])`.

**Oberfläche:** `/dashboard/admin/users` — Benutzer anlegen, Rolle wechseln,
löschen. Logik in `lib/users/manage.ts`, die Sicherheitsregeln (letzter Admin,
Selbst-Löschung, Selbst-Degradierung) als reine Funktionen in
`lib/users/rules.ts` samt Tests. **Jede** Server Action beginnt mit
`requireOwner()` — Actions sind eigene HTTP-Endpunkte und nicht dadurch
geschützt, dass die Seite es ist.

> Rollen-Helfer (`roleLabel`, `isRole`, `ROLES`) stehen in `lib/roles.ts`, nicht
> in `lib/authz.ts`. Client-Komponenten müssen aus `lib/roles.ts` importieren —
> `lib/authz.ts` hängt an `auth.ts` und zöge den Mailversand ins Browser-Bundle.

**Account per CLI anlegen / Rolle setzen** (idempotenter Upsert nach E-Mail; der
Betreiber loggt sich danach ganz normal per Magic-Link ein):

```bash
make user-create ARGS="--email chef@example.de --role owner --apply"
make user-list                       # oder: ARGS="--role owner"
# direkt: node scripts/users/create-user.mjs --email … --role owner --apply
```

Dry-Run ist Standard; erst `--apply` schreibt. Details: `scripts/users/README.md`.

## Tarife & Digistore-Produkte

Die Tarif-Liste in `config/digistore-products.json` ist die **einzige Quelle** —
sie speist die Tarif-Seite (`app/tarife/page.tsx`) *und* das Sync-Skript. Lege
keine zweite Preisliste im Code an.

- `make ds24-connect` — API-Key holen (Browser) und in `.env` schreiben
- `make ds24-sync ARGS=--apply` — Produkte **und** IPN-Anbindung anlegen/
  aktualisieren (idempotent): `productId` wird in die JSON zurückgeschrieben, die
  IPN wird per API registriert (nur bei öffentlicher `APP_URL`; lokal übersprungen)

**Preise gehören nicht ans DS24-Produkt.** Die API verwirft `data[amount]`, und
Bezahlpläne lassen sich per API nicht anlegen. Stattdessen gehen `priceCents`
und `billingInterval` beim Checkout als `payment_plan[...]` an `createBuyUrl`
(`lib/digistore/buyUrl.ts`). In der DS24-Oberfläche sind also **keine**
Bezahlpläne nötig.

## Lokale Befehle

Alles läuft über das `Makefile` (`make` allein zeigt die Übersicht):

- `make start` — Datenbank + Migrationen + App (http://localhost:3000)
- `make stop` — App + Datenbank stoppen · `make restart` · `make logs` · `make status`
- `make test` — TypeScript-Prüfung + Tests (u. a. IPN-Signaturprüfung)
- `make smoke` — jede Seite einmal aufrufen; findet „Internal Server Error"
- `make db-generate` / `make db-migrate` — Migration erzeugen / einspielen
- `make db-reset` — lokale DB leeren, migrieren, Seed (**nur lokal**)
- `make user-create ARGS="--email … --role owner --apply"` — Betreiber-/Admin-Account anlegen
- `make mail-setup` — E-Mail-Versand einrichten (Postmark oder SMTP) + Testmail
- `make ds24-connect` — Digistore24-API-Key holen und in `.env` speichern
- `make build` — Produktions-Build

Die npm-Skripte dahinter (`npm run dev`, `npm run db:migrate`, …) bleiben
nutzbar; im Zweifel den `make`-Befehl nennen, der ist für Nicht-Entwickler gedacht.

## STOPP-Kriterien

Bei Änderungen an Abrechnungslogik, Signatur-/Auth-Prüfungen, dem Export/Löschen
von Kundendaten oder neuen externen Zahlungs-/Datenintegrationen: erst `guardrails`
lesen und im Zweifel einen Menschen einbeziehen.
