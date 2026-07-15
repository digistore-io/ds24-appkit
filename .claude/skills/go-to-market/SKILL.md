---
name: go-to-market
description: Berät den Nutzer, sein fertiges SAAS-Produkt in den Markt einzuführen. Erarbeitet Positionierung und Preis, wählt zur Reichweite passende Kanäle (inkl. Digistore-Affiliates), erstellt einen einfachen Launch-Plan und liefert fertigen Content — Landingpage-Texte, E-Mail-Sequenz, Social-Posts und Video-Skripte (Hook → Problem → Lösung → CTA). Nutze dies, wenn die App steht und verkauft werden soll.
---

# Vom Produkt zum Markt (Go-to-Market)

Ziel: den ersten zahlenden Kunden gewinnen — mit einem **einfachen, konkreten**
Plan und **fertigem Content**, den der Nutzer sofort einsetzen kann. Baue auf dem
`docs/product-brief.md` (aus `market-research`) auf, falls vorhanden.

Führe schrittweise. Frag nach (AskUserQuestion), schlag vor, liefere Fertiges.

## Phase 1 — Positionierung & Preis

- **Kernbotschaft** in einem Satz: „[Zielgruppe] erreicht [Ergebnis] ohne [Schmerz]."
- **Angebot & Preis:** Was genau wird verkauft (Kurs, Mitgliedschaft, Tool-Zugang)?
  Einmalkauf oder Abo? Preisanker nennen (an der Zielgruppe orientiert). Bei Abo
  ggf. Jahres-Rabatt. Die Abrechnung läuft über Digistore (`setup-digistore`).
- **Angebots-Verstärker:** Bonus, Garantie, Verknappung (ehrlich einsetzen).

## Phase 2 — Kanäle (zur Reichweite passend)

Frag nach vorhandener Reichweite und wähle **1–2 Kanäle** (nicht alle auf einmal):
- **Eigene Liste / Community** — schnellster Weg, wenn vorhanden.
- **Social (organisch)** — kurzform-Video/Posts; gut für Reichweitenaufbau.
- **Digistore-Affiliates** — Partner verkaufen gegen Provision. `createBuyUrl`
  unterstützt Affiliate-Provisionen; ein Marktplatz-Eintrag bringt Reichweite ohne
  eigenes Publikum. Für viele Digistore-Vendoren der wichtigste Hebel.
- **Content/SEO** — mittelfristig, wenn Suchintention existiert.
- **Paid Ads** — nur mit Budget und sauberem Funnel; nicht für den allerersten Start.

## Phase 3 — Launch-Plan (einfach)

Ein schlanker Ablauf statt großem Launch:
1. **Vorbereitung:** Landingpage + Checkout-Link (`setup-digistore`) live, Opt-in-Seite geprüft.
2. **Ankündigung:** 2–3 Berührungspunkte vor dem Verkaufsstart (Liste/Social).
3. **Verkauf öffnen:** klare Frist/CTA.
4. **Nachfassen:** Erinnerung, Einwände auflösen, Sozialbeweis.
5. **Nach dem Launch:** Feedback einsammeln, Affiliate-Programm ausrollen.

## Phase 4 — Content erstellen (fertig zum Einsatz)

Erzeuge konkreten Content und lege ihn unter `docs/marketing/` ab:
- **Landingpage-Text:** Headline, Subheadline, Problem, Nutzen/Features, Sozialbeweis,
  Preis, FAQ, klarer CTA (verlinkt den Digistore-Checkout).
- **E-Mail-Sequenz:** 3–5 Mails (Ankündigung → Nutzen/Story → Sozialbeweis →
  letzte Chance). Betreffzeilen inklusive.
- **Social-Posts:** 5–10 kurze Posts/Hooks für den gewählten Kanal.
- **Video-Skripte:** mindestens
  - ein **Kurzvideo-Skript** (30–60 s) nach dem Muster **Hook → Problem → Lösung →
    Beweis → CTA**, mit Szenen-/Sprechtext;
  - optional ein **VSL/Explainer-Skript** (2–3 min) für die Landingpage.
  Schreibe Sprechtext, den der Nutzer 1:1 aufnehmen kann; halte ihn konkret und
  in der Sprache der Zielgruppe.

Passe Tonalität an die Zielgruppe an. Erfinde keine falschen Behauptungen/
Testimonials — kennzeichne Platzhalter (z. B. „[echtes Kundenzitat einsetzen]").

## Phase 5 — Messen & iterieren

Nenne 2–3 einfache Kennzahlen (Besucher → Checkout-Klicks → Käufe) und wie man sie
sieht (Digistore-Statistik). Empfiehl eine kleine Verbesserung pro Woche.

## Prinzipien

- **Ein Kanal, ein Angebot, ein klarer CTA** — Fokus schlägt Breite beim Start.
- **Reichweite nutzen, die schon da ist**, bevor neue aufgebaut wird.
- **Ehrliches Marketing** — keine erfundenen Ergebnisse/Bewertungen (auch rechtlich).
- Nächster Schritt nach dem Launch: Kennzahlen ansehen, Angebot/Content nachschärfen.
