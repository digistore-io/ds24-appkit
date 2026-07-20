---
name: guardrails
description: Sicherheits- und Sorgfaltsregeln für diese Digistore-SAAS. Lies dies, bevor du etwas rund um Geld/Abrechnung, Secrets/API-Keys, personenbezogene Kundendaten (DSGVO) oder externe Systeme änderst. Nennt die Stopp-Kriterien, bei denen du einen Menschen einbeziehen solltest.
---

# Guardrails — bevor etwas schiefgeht

Diese App verarbeitet **echtes Geld** und **echte Kundendaten**. Halte dich an die
folgenden Regeln. Sie sind der „goldene Pfad“ — reiße sie nicht heraus.

## Geld & Abrechnung

- Die **IPN-Signaturprüfung (SHA512)** in `lib/digistore/ipn.ts` ist Pflicht.
  Niemals abschalten, lockern oder umgehen.
- Order-Status ausschließlich über IPN-Events setzen (`mapEventToStatus`). Zugänge
  an `orders.status` koppeln (`paid` = frei; `refunded`/`chargeback`/`cancelled` =
  sperren; `paused` = temporär sperren).
- **Kein Mock-/Demo-Fallback** bei API-Fehlern. Fehler sichtbar machen, nicht
  verstecken.
- Idempotenz wahren: Käufe sind über `ds24OrderId` eindeutig — nie doppelt
  verbuchen.

## Secrets & API-Keys

- **Niemals** API-Keys, Passphrases oder Tokens in den Code, ins Repo oder in Logs.
- Konfiguration über `.env` (neue Variablen in `.env.example` ergänzen) bzw. die
  Secret-Verwaltung des Hosters. Die Digistore24-Zugangsdaten des Betreibers
  (`DIGISTORE_API_KEY`, `DIGISTORE_IPN_PASSPHRASE`) holt `make ds24-connect` in
  die `.env`; gelesen werden sie über `lib/digistore/settings.ts`. Keine
  Oberfläche zum Eintragen von Schlüsseln bauen.

## Kundendaten & DSGVO

- Nur erheben, was gebraucht wird. Einwilligung über die Opt-in-Seite festhalten
  (`orders.gdprConsentAt`), das `is_gdpr_country`-Flag beachten.
- Käufer-Daten nicht an Dritte/externe Dienste weitergeben ohne klaren Zweck und
  Einwilligung.

## Auth

- Alles außer öffentlichen Seiten (Start, Login, Opt-in) und dem IPN-Endpoint ist
  auth-geschützt. Neue geschützte Bereiche im `matcher` von `middleware.ts` ergänzen.

## STOPP — hier einen Menschen einbeziehen

Mach **nicht allein** weiter, sondern frag nach, wenn du dabei bist:

- die Abrechnungs-/Auszahlungslogik oder Preisberechnung grundlegend zu ändern,
- die Signatur-/Auth-Prüfungen anzupassen oder zu deaktivieren,
- personenbezogene Daten zu exportieren, zu löschen oder an externe Systeme zu senden,
- eine neue externe Integration mit Zugriff auf Zahlungen oder Kundendaten anzubinden,
- Datenbank-Migrationen auszuführen, die bestehende Bestell-/Nutzerdaten verändern.
