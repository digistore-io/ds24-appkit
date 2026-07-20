---
name: security-gateway
description: Sicherheits-Gateway vor dem Launch. Scannt die App systematisch auf Sicherheitslücken (Auth-Lücken, ungeschützte Routen, Secrets im Code, IPN-/Signatur-Umgehung, fehlende Zugriffskontrolle/IDOR, XSS, verwundbare Abhängigkeiten) und behebt die Funde. Nutze dies, bevor die App echte Zahlungen und Kundendaten verarbeitet, und nach größeren Änderungen.
---

# Security-Gateway — scannen und beheben

Diese App verarbeitet **Geld und Kundendaten**. Bevor sie live geht (und nach
größeren Änderungen), diesen Scan durchlaufen: **prüfen → Funde nach Schwere
sortieren → beheben → erneut prüfen.** Nichts durchwinken.

Falls in der Umgebung ein Security-Review-Werkzeug verfügbar ist (z. B.
`/security-review`), nutze es zusätzlich. Die folgende Checkliste ist auf dieses
Template zugeschnitten.

## Checkliste (prüfen und beheben)

### 1. Authentifizierung & Zugriffskontrolle
- Alle nicht-öffentlichen Seiten/Routen sind geschützt (`middleware.ts`-Matcher).
  Öffentlich sind nur Startseite, `/login`, `/optin/*`, `/access/*` (falls genutzt)
  und `/api/ipn`. Neue geschützte Bereiche in den Matcher aufnehmen.
- **IDOR:** Greift eine Server-Action/Route nur auf Daten des eingeloggten Nutzers zu?
  Prüfe jede Abfrage auf `where userId = session.user.id` (bzw. Besitzprüfung).
  Beispiel-Muster: `generateCheckoutLink` prüft `challenge.userId === userId`.
- Geschützte Inhalte hängen ausschließlich an bezahltem Status (`orders.status === "paid"`),
  nicht an ratbaren IDs allein.

### 2. Digistore / Zahlungen
- IPN-**SHA512-Signaturprüfung** ist aktiv und **fail-closed** (`lib/digistore/ipn.ts`),
  wird nirgends umgangen. Ungültige Signatur → 403.
- Idempotenz über `ds24OrderId` (kein Doppelbuchen).
- **Kein Mock-/Demo-Fallback** bei API-Fehlern.

### 3. Secrets
- Keine API-Keys/Passphrases/Tokens im Code, in Logs oder im Client-Bundle.
  Serverseitige Werte nie an Client-Komponenten durchreichen.
- `.env` ist **nicht** eingecheckt (`.gitignore`), neue Variablen in `.env.example`.
- Die Digistore24-Zugangsdaten des Betreibers liegen in der Umgebung
  (`.env` bzw. Secret-Verwaltung des Hosters) und werden über
  `lib/digistore/settings.ts` gelesen — nicht in der Datenbank und nicht im Code.
  Es gibt bewusst **keine** Oberfläche, um Schlüssel einzugeben; ein solches
  Eingabefeld wäre zusätzliche Angriffsfläche und darf nicht nachgerüstet werden.
- **Bekannte Ausnahme, kein Fund:** `BUILT_IN_DEVELOPER_KEY` in
  `scripts/ds24/connect-api-key.mjs`.
  Ein Digistore24-Developer-Key trägt keine Kontorechte — er identifiziert nur
  die Anwendung gegenüber `requestApiKey`, wie eine OAuth-Client-ID. Der
  rechtetragende Key entsteht erst bei der Freigabe durch den Merchant. Nicht
  entfernen und nicht verschleiern; die Scanner-Marker an der Zeile gehören dazu.

### 4. Eingaben & Ausgaben
- Formular-/Action-Eingaben validieren (Pflichtfelder, Typen, Grenzen; `zod` nutzen).
- DB-Zugriffe über Drizzle (parametrisiert) — **kein** String-gebautes SQL.
- **XSS:** vom Nutzer/ Käufer gelieferte Texte werden als Text gerendert, **nicht**
  via `dangerouslySetInnerHTML`. Prüfe alle Render-Stellen von Fremdinhalten.
- Öffentliche Endpoints (IPN, Opt-in) gegen Missbrauch absichern (einfaches
  Rate-Limiting/Abuse-Schutz erwägen).

### 5. Abhängigkeiten & Konfiguration
- `npm audit` ausführen; hohe/kritische Lücken durch Updates beheben.
- Aktuelle, gepatchte Framework-Versionen (Next.js etc.).
- Sicherheits-Header erwägen (z. B. via `next.config`/Middleware).

## Ablauf

1. **Scannen:** Checkliste + verfügbares Security-Tool durchgehen; jede Abweichung
   als Fund mit Schweregrad (kritisch/hoch/mittel/niedrig) notieren.
2. **Beheben:** kritische und hohe Funde **jetzt** beheben. Fixes klein und gezielt.
3. **Verifizieren:** betroffene Flows erneut prüfen (z. B. ungültige Signatur → 403,
   fremde ID → kein Zugriff), Tests laufen lassen.
4. **Berichten:** kurze Zusammenfassung (was gefunden, was behoben, was offen).

## STOPP-Kriterien (Mensch einbeziehen)
Bei Verdacht auf Datenabfluss, umgangener Zahlungs-/Signaturprüfung oder Zugriff auf
fremde Kundendaten: nicht selbst „drüberbügeln", sondern melden (siehe `guardrails`).

Nächster Schritt nach grünem Security-Gateway: **`performance-gateway`**.
