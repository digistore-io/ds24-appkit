# Login einrichten

Die App nutzt standardmäßig **E-Mail-Token-Login (Magic-Link)** — kein Passwort.
Der Nutzer gibt seine E-Mail ein, bekommt einen Anmelde-Link zugeschickt und ist
nach dem Klick angemeldet. Dafür braucht die App einen **E-Mail-Versand**: entweder
**Postmark** oder **SMTP**. **Google-Login ist optional** zusätzlich möglich.

Alle Werte kommen in die `.env` (Vorlage: `.env.example`). Basis immer setzen:

```bash
AUTH_SECRET=        # openssl rand -hex 32
AUTH_TRUST_HOST=true
APP_URL=https://deine-domain.de
# APP_NAME=Meine App   # optional, erscheint in der Login-Mail
```

## E-Mail-Versand — Variante A: Postmark (empfohlen, einfach)

1. Konto bei [postmarkapp.com](https://postmarkapp.com) anlegen, einen **Server**
   erstellen und dessen **Server-API-Token** kopieren.
2. Unter *Sender Signatures* (oder eine ganze Domain) deine **Absenderadresse
   verifizieren** (DKIM/Return-Path setzen). Diese Adresse ist die „Sender-Id".
3. In die `.env`:

```bash
POSTMARK_SERVER_TOKEN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
POSTMARK_SENDER=login@deine-domain.de   # verifizierter Absender
# POSTMARK_MESSAGE_STREAM=outbound       # Standard
```

## E-Mail-Versand — Variante B: SMTP (beliebige Mailbox)

Funktioniert mit jedem Mailserver/Postfach (z. B. der eigene Hoster). In die `.env`:

```bash
SMTP_HOST=smtp.deinprovider.de
SMTP_PORT=587            # 587 = STARTTLS, 465 = SSL
SMTP_SECURE=false        # true nur bei Port 465
SMTP_USER=postfach@deine-domain.de
SMTP_PASSWORD=…
SMTP_FROM=login@deine-domain.de
```

Ist **weder Postmark noch SMTP** gesetzt, wird der E-Mail-Login nicht angeboten.

## Google-Login (optional)

Bequem für Nutzer, aber **Einrichtung + Freigabe brauchen Zeit**: Google prüft
Apps mit OAuth-Zustimmungsbildschirm; bis zur Freigabe für externe Nutzer können
**mehrere Tage bis Wochen** vergehen. Bis dahin funktioniert der Login nur für
manuell eingetragene Test-Nutzer. Der E-Mail-Login ist sofort einsatzbereit —
Google kann jederzeit später ergänzt werden.

Schritte in der [Google Cloud Console](https://console.cloud.google.com/):

1. Projekt anlegen (oder vorhandenes wählen).
2. **APIs & Dienste → OAuth-Zustimmungsbildschirm**: Nutzertyp „Extern", App-Name,
   Support-E-Mail, Domain(s) und Entwickler-Kontakt eintragen. Scopes `email`,
   `profile`, `openid` genügen. Zunächst im **Testmodus** (Test-Nutzer eintragen),
   später „Veröffentlichen" → Google-**Verifizierung** durchlaufen (dauert).
3. **APIs & Dienste → Anmeldedaten → OAuth-Client-ID erstellen** → Typ
   „Webanwendung".
   - **Autorisierte Weiterleitungs-URIs**:
     `https://deine-domain.de/api/auth/callback/google`
     (lokal zusätzlich `http://localhost:3000/api/auth/callback/google`).
4. Client-ID + Secret in die `.env`:

```bash
GOOGLE_CLIENT_ID=…apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=…
```

## Verifizieren

Nach dem Setzen der Variablen: App starten, `/login` öffnen — es erscheint das
E-Mail-Formular (und, falls konfiguriert, „Weiter mit Google"). E-Mail eingeben →
Link kommt an → Klick meldet an. Verifikations-Tokens liegen in der DB-Tabelle
`verificationTokens` (Drizzle-Adapter).

## Betreiber-/Admin-Account anlegen

Der Login ist passwortlos — Accounts entstehen beim ersten Magic-Link-Login mit
Rolle `member`. Damit sich der **Betreiber** als Admin (`owner`) einloggen kann,
den Account **vorab** per CLI anlegen (die Zeile wird beim Login wiederverwendet):

```bash
node scripts/users/create-user.mjs --email chef@example.de --role owner --apply
# oder: make user-create ARGS="--email chef@example.de --role owner --apply"
```

Rollen: `owner` = Betreiber/Admin, `member` = Kunde. Admin-Bereiche mit
`requireOwner()` (`lib/authz.ts`) absichern. Details: `scripts/users/README.md`.
