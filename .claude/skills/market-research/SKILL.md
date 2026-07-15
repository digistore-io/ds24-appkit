---
name: market-research
description: Start hier, wenn du noch KEINE klare SAAS-Idee hast (oder sie schärfen willst). Interviewt dich zu Expertise, Interessen und vorhandener Reichweite, schlägt Zielgruppen vor, recherchiert deren Situation und Herausforderungen und leitet daraus einen konkreten, über Digistore24 verkaufbaren SAAS-Produktvorschlag ab. Mündet in einen Product-Brief und übergibt an build-app.
---

# Von der Idee zum Produktvorschlag (Marktrecherche)

Ziel: aus dem, was **du** gut kannst oder erreichst, ein **konkretes SAAS-Produkt**
ableiten, das eine echte Zielgruppe braucht — und das sich über Digistore24
verkaufen lässt (digitale Produkte, Kurse, Mitgliedschaften, Tools).

Führe den Nutzer **schrittweise** durch die folgenden Phasen. Stelle Fragen mit dem
Fragen-Tool (AskUserQuestion), fasse nach jeder Phase kurz zusammen und lass
bestätigen, bevor du weitergehst. Erfinde keine Fakten — recherchiere.

## Phase 1 — Interview: Ausgangslage

Stelle (in 1–2 Runden) Fragen, um Expertise, Motivation und Assets zu verstehen:
- **Expertise/Hintergrund:** Worin kennst du dich wirklich aus (beruflich, Hobby,
  gelöste eigene Probleme)?
- **Vorhandene Idee:** Hast du schon eine Produktidee oder Zielgruppe im Kopf?
- **Reichweite/Assets:** Erreichst du bereits Leute (E-Mail-Liste, Social Media,
  Community, Kundschaft)? Das entscheidet oft über Erfolg.
- **Ziel & Rahmen:** Nebeneinkommen oder Hauptgeschäft? Wie viel Zeit? Einmalkauf
  oder Abo bevorzugt?

Fasse die Antworten als kurzes Profil zusammen und lass es bestätigen.

## Phase 2 — Zielgruppen-Kandidaten

Leite **2–4 konkrete Zielgruppen/Nischen** aus dem Profil ab (spezifisch, nicht
„alle Selbstständigen", sondern z. B. „Heilpraktiker:innen, die online Kurse
verkaufen"). Nenne je Kandidat kurz: wer, warum du sie glaubwürdig bedienen kannst,
und ob sie erfahrungsgemäß für digitale Produkte zahlen.

Lass den Nutzer **eine Zielgruppe wählen** (oder eine eigene ergänzen).

## Phase 3 — Recherche: Situation & Herausforderungen

Recherchiere die gewählte Zielgruppe **mit echten Quellen**. Nutze Websuche
(WebSearch/WebFetch); wenn der `deep-research`-Skill verfügbar ist, nutze ihn für
eine tiefere, quellenbelegte Analyse. Kläre:
- **Situation & Workflows:** Wie arbeiten diese Menschen heute? Womit verdienen sie?
- **Schmerzpunkte:** Welche wiederkehrenden Probleme, Zeitfresser, Frustrationen?
- **Bestehende Lösungen & Lücken:** Was nutzen sie schon, was fehlt?
- **Zahlungsbereitschaft:** Wofür geben sie bereits Geld aus (Kurse, Tools, Vorlagen)?

Fasse die Erkenntnisse **mit Quellenangaben** zusammen (3–6 Kernpunkte). Priorisiere
ein bis zwei Probleme, die häufig, schmerzhaft und lösbar sind.

## Phase 4 — Produktvorschlag

Leite daraus **einen konkreten SAAS-Vorschlag** ab (bei Bedarf 2 Varianten zur Wahl):
- **Problem** (eine klare Aussage) und **Zielnutzer** (aus Phase 2).
- **Nutzenversprechen** in einem Satz.
- **MVP-Funktionsumfang:** 3–5 Kernfunktionen — **bewusst klein** und auf diesem
  Template baubar (Auth + Datenmodell + wenige Seiten, Zugang an Kauf gekoppelt).
- **Digistore-Abrechnung:** Was ist das „Produkt"? Einmalkauf, Abo oder Mitgliedschaft?
  Wie schaltet der Kauf den Nutzen frei (vgl. `orders.status`, IPN)?
- **Namensvorschlag** (optional).

Prüfe den Vorschlag gegen `guardrails` (Geld, Kundendaten, Secrets) und weise auf
offene Punkte hin (z. B. rechtlich sensible Daten).

Präsentiere den Vorschlag und **iteriere**, bis der Nutzer zufrieden ist.

## Phase 5 — Übergabe an den Bau

Schreibe das Ergebnis in einen kurzen **Product-Brief** nach `docs/product-brief.md`
(Problem, Zielnutzer, Nutzenversprechen, MVP-Funktionen, Abrechnungsmodell, Quellen).
Danach weiter mit dem Skill **`build-app`** (Archetyp, Datenmodell, Seiten) und
**`setup-digistore`** (Abrechnung anschließen).

## Prinzipien

- **Recherche statt Raten:** Aussagen über die Zielgruppe mit Quellen belegen.
- **Klein starten:** Ein MVP, das auf diesem Template in überschaubarer Zeit steht,
  schlägt das große Luftschloss.
- **Reichweite ernst nehmen:** Eine erreichbare Zielgruppe ist mehr wert als die
  „größere" Marktchance ohne Zugang.
- **Zum Verkaufsmodell passen:** Digistore24 ist stark bei digitalen Produkten,
  Kursen, Mitgliedschaften und Tools — richte den Vorschlag darauf aus.
