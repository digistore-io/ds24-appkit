---
name: compliance-check
description: Prüft vor dem Verkauf die rechtliche Grundausstattung (v. a. DE/EU) und legt fehlende Rechtsseiten an — Impressum, Datenschutzerklärung sowie, je nach Verkäuferrolle, AGB und Widerrufsbelehrung. Prüft DSGVO-Grundlagen (Datenminimierung, Einwilligung, Auftragsverarbeitung) und verlinkt die Seiten im Footer. Nutze dies vor go-live/go-to-market. KEINE Rechtsberatung — Vorlagen mit Platzhaltern.
---

# Compliance-Check — rechtlich startklar (DE/EU)

Ziel: die App vor dem Verkauf **rechtlich grundausgestattet** machen. Dies ersetzt
**keine Rechtsberatung** — es erstellt Vorlagen mit Platzhaltern und weist auf
Pflichten hin. Für verbindliche Texte einen Anwalt oder einen offiziellen
Generator (z. B. von IHK/eRecht24/Anwaltskanzleien) nutzen.

## Wichtig: Wer ist der Verkäufer?

Digistore24 tritt bei vielen Setups als **Reseller** (Vertragspartner des Käufers)
auf und übernimmt dann Teile der Verkaufs-Rechtspflichten (Rechnung, Widerruf im
Checkout, Umsatzsteuer). **Trotzdem** braucht deine eigene App/Landingpage eigene
Rechtstexte (mindestens Impressum + Datenschutz). Kläre die Rolle im
Digistore-Vertrag und richte AGB/Widerruf danach aus.

## Checkliste — Seiten anlegen (falls fehlend)

Lege fehlende Seiten als eigene Routen an und verlinke sie im Footer (jeder Seite):
- **Impressum** (`/impressum`) — Anbieterkennzeichnung (§5 TMG/§18 MStV):
  Name/Firma, Anschrift, Kontakt, ggf. USt-IdNr., Vertretungsberechtigte.
- **Datenschutzerklärung** (`/datenschutz`) — DSGVO: welche Daten, Zweck,
  Rechtsgrundlage, Empfänger (Hoster, Digistore, E-Mail-Dienst), Speicherdauer,
  Betroffenenrechte, Kontakt.
- **AGB** (`/agb`) — nur wenn du (nicht Digistore) Verkäufer bist bzw. für die
  Nutzung der App-Leistung.
- **Widerrufsbelehrung** (`/widerruf`) — bei Verbrauchern; für digitale Inhalte
  gilt ein Erlöschen des Widerrufsrechts nur mit ausdrücklicher Zustimmung +
  Kenntnisnahme (sonst Widerrufsrecht). Nur nötig, wenn du der Verkäufer bist.

Setze in die Vorlagen klar erkennbare Platzhalter, z. B. `[FIRMENNAME]`,
`[ANSCHRIFT]`, `[E-MAIL]`, und weise den Nutzer an, sie zu ersetzen.

## DSGVO-Grundlagen (prüfen)

- **Datenminimierung:** nur erheben, was gebraucht wird.
- **Einwilligung:** die Opt-in-Seite hält die Zustimmung fest (`orders.gdprConsentAt`);
  `is_gdpr_country` beachten.
- **Auftragsverarbeitung (AVV):** mit Hoster, Digistore und E-Mail-Dienst abschließen
  (die Anbieter stellen Musterverträge bereit).
- **Cookies/Tracking:** nur mit Einwilligung (Consent-Banner) — aber **nur**, wenn
  wirklich getrackt wird. Ohne Tracking kein Banner nötig.
- **Datenauskunft/-löschung:** einen Weg vorsehen, Kundendaten auf Anfrage zu
  exportieren/löschen.

## Ablauf

1. **Prüfen:** Welche Rechtsseiten existieren? Welche Rolle hat Digistore (Reseller)?
2. **Anlegen:** fehlende Seiten als Vorlagen mit Platzhaltern erstellen, im Footer
   verlinken.
3. **DSGVO abhaken:** Punkte oben durchgehen, offene To-dos benennen.
4. **Hinweisen:** klar sagen, was der Nutzer selbst ausfüllen/prüfen (lassen) muss.

## STOPP / Grenze
Dies ist **keine Rechtsberatung**. Bei Unsicherheit (v. a. AGB/Widerruf, Steuern,
besondere Datenkategorien) einen Anwalt/Steuerberater einbeziehen — siehe `guardrails`.

Nächster Schritt: **`go-live`** (online stellen), danach **`go-to-market`**.
