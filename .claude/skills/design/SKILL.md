---
name: design
description: Gives this app a look of its own — researches how comparable apps present themselves, proposes two or three named identity packages (accent colour, type pairing, page composition), writes the choice into docs/design.md, recolours the tokens and proves it on a real page. Use this when the user says "it looks generic", "it looks like every other app", "give it its own look", "I want a custom design", "change the colours", "change the font", or when build-app step 1e hands over. Costs nothing per use — no AI calls, about fifteen minutes.
---
<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# A look of its own

Every app built on this template ships the same way: neutral grey, indigo
accent, Geist. That is a deliberate default, not a defect — and it is also why
two apps built by two strangers look like the same product. This skill is the
one place that changes it.

**What "design" means here is narrow on purpose.** The kit stays the kit
(`CLAUDE.md` § **UI**: *there is nothing to design here — there is something to
use*). This skill sets the values the kit already has slots for — the accent
tokens, the type variables, the radius, and the way pages are composed from the
existing components — and writes them down so every later page follows them.
It never builds a component, never writes a hex class, never adds a fourth
feedback mechanism.

**The decision is the user's, never yours** (`CLAUDE.md` → *How a skill works*).
You propose named directions; they pick, decline, or say "you choose".

## Step 0 — Is there already a look?

Three things to check before anything else:

- **`docs/design.md` exists** → this app already chose. Read it, say what it
  holds in two sentences, and ask what should change. A change is edited
  **there first**, then applied — the file is the app's visual identity, and a
  page restyled past it is how the identity stops being one.
- **`docs/app.md` records a "no"** (*No custom identity* under the decisions)
  → that is an answer. Say you found it and ask in ONE sentence whether it
  still holds. If yes, stop.
- **An experiment** ("just show me", a test app) → skip the whole skill, same
  boundary as everywhere else.

Somebody who only wants one narrow thing ("make it green", "a serif headline")
gets that thing — do the matching slice of Step 3, update or create
`docs/design.md` with just that decision, and do not unroll the full menu.

## Step 1 — Ground it (bounded research)

A look that fits comes from the product, not from a palette generator. Two
sources, in this order:

1. **Ask the user for 1–3 apps or sites they admire** — or that their
   customers already use. Most vendors here are not designers and may have
   none; then name 2–3 well-known products from the app's own category
   yourself (`docs/app.md` → *The product* says what that category is) and say
   why you picked them.
2. **Look at how those present themselves — a mood check, not a competitive
   audit.** Hard budget: **two or three web searches, no more.** What you take
   from them, and all you take:

   | Take | Never take |
   |---|---|
   | the mood, in 2–4 words ("calm, clinical", "loud, playful") | exact hex codes |
   | the layout pattern per page type — card grid, table, hero-result | their fonts (licensed, and theirs) |
   | density — spacious or compact | copy, wording, taglines |
   | ONE signature-element idea (a numbered ritual, a big result figure) | screenshots or assets into the project |

No web search in this program? Say "judged from training data, not looked up"
and carry on — the menu below works either way
(`CLAUDE.md` → *What the skills assume you can do*).

## Step 2 — Propose, then wait

Put **two or three named identity packages** to the user as a numbered menu.
Each row is one coherent direction: an accent hue, a type pairing from the
list below, a radius, and the mood it serves — derived from Step 1, not
invented fresh. Mark ONE row ✅ as your recommendation:

```
This app can keep the kit's default look, or take one of its own.
None of these costs anything to run — it is about fifteen minutes of work.

  1  "Klinik"  — deep teal accent, Inter + Source Serif 4, sharper corners.
                 Calm and clinical, like the two references you named      ✅
  2  "Werkbank" — amber accent, IBM Plex Sans, the shipped radius.
                 Tool-like, dense, numbers first
  3  keep Geist, recolour only — your brand colour on the shipped type

  0  keep the default look (indigo on neutral, Geist)

Give me a number, or say "you choose" and I take the one marked ✅.
```

Three answers, all valid:

- **A number** → exactly that package, Step 3.
- **"you choose"** → the ✅ row, no further question.
- **`0`** → nothing changes, and it is **written into `docs/app.md`** under
  *Decisions worth remembering*:

  ```md
  - **No custom identity.** Decided on <date>: the shipped look (indigo on
    neutral, Geist) stays. If it comes back, the way in is the skill `design`.
  ```

**Do not negotiate a `0`**, and do not open a second round of options after a
number — a design conversation that keeps going is the failure mode of this
skill. One menu, one answer, then work.

### The type pairings — this list, nothing off it

All via `next/font/google`, which downloads the files **once at build time**
and serves them from the app's own origin — a visitor's browser never contacts
Google, so the app's no-consent stance (`docs/compliance.md`) is untouched.

| Pairing | Carries | Wiring |
|---|---|---|
| **Geist** (shipped) | neutral, technical — the default | nothing to do |
| **Inter + Source Serif 4** headings | editorial, trustworthy — coaching, courses, content | body `Inter`, headings `Source_Serif_4` |
| **Manrope** | friendly, rounded — consumer, community | one font for everything |
| **IBM Plex Sans** | tool-like, precise — dashboards, calculators | one font for everything |

The wiring reuses the variables the app already hangs its fonts on — swap the
imports in `app/layout.tsx` and keep the variable names:

```tsx
import { Manrope } from "next/font/google";
const sans = Manrope({ subsets: ["latin"], variable: "--font-geist-sans" });
// <html className={`${sans.variable} ${GeistMono.variable}`}>
```

A heading font is one extra variable plus one rule in `@layer base` in
`app/globals.css` (`h1, h2, h3 { font-family: var(--font-heading), … }`) —
next to the `text-wrap: balance` rule that is already there. Nothing else, and
never a `font-[…]` class on a page.

## Step 3 — Write it down, then apply it

**The file comes first.** Create `docs/design.md` — this app's visual
identity, the file every later page follows. Keep it to 40–60 lines:

```markdown
# <App name> — how it looks

_Chosen on <date>, direction "<package name>", via the skill `design`. Every
page built since is expected to match this file rather than invent its own
look. Change it here first, then apply it — never page by page. Nothing in
here overrides CLAUDE.md § UI or docs/ux.md._

## Identity
- **Mood:** <2–4 words>
- **Looked at:** <the 1–3 references, and what was taken: mood and patterns,
  nothing else>

## Tokens — delta from the shipped defaults
(only what changed; everything unlisted keeps the shipped value)
- `--primary`: hsl(…) light / hsl(…) dark — "<colour name>"
- `--primary-foreground`, `--ring`: <the values that went with it>
- `--radius`: <only if changed>

## Typography
- <the pairing, and where it is wired: app/layout.tsx>

## Page composition
(one line per page type this app has — which components, in which order;
docs/ux.md §0 is the base, this is the delta)
- **Dashboard home:** <e.g. the week's result as a big figure in a Card,
  checklist below, never the other way round>
- **Result pages:** <…>
- **The salespage (`/`):** <mood and composition only — e.g. where the
  signature element shows to a stranger; the sections themselves are the
  skill `salespage`>
- **Settings/account:** unchanged — the same on every app, on purpose

## Signature element
<the ONE deliberate flourish, and the pages it appears on. One, not three.>

## Do / Don't
- <2–4 app-specific rules, e.g. "numbers are the hero — never bury a result
  under its explanation">
```

Then apply it:

1. **Tokens:** `--primary`, `--primary-foreground`, `--ring` (and `--radius`
   if chosen) in **both** blocks of `app/globals.css` — `:root` and `.dark`.
   The file's own header says why the two modes need different values;
   `docs/ux.md` §7 is the reference.
2. **Type:** the wiring above, if the pairing changed.
3. **Measure:** `node run.mjs ux-check` — **it must be green.** `--primary` is
   a surface AND a text colour, and the mode you were not looking at is the
   one that breaks. A red pair is fixed by adjusting lightness, never by
   accepting the finding.

## Step 4 — Look at it

A recolour that was never seen is a guess. The shipped pages make this cheap —
`/`, `/plans` and the dashboard carry the tokens and the type from minute one:

```bash
node run.mjs start
```

Open `/plans` and the dashboard. **Both themes, and once at ~380 px.** If a
browser tool is available, use it; if not, `ux-gateway` explains how to offer
the Playwright MCP server — or ask the user to open the page and say in one
line whether it is what they picked. Then `node run.mjs errors`.

One confirmation sentence from the user closes the step. If they want it
adjusted, adjust `docs/design.md` first, then the tokens — same order as
always.

## The rules

1. **The file is the identity.** A later page follows `docs/design.md`; a
   change goes into `docs/design.md` first. Two looks in one app is worse than
   the default look.
2. **Tokens only, kit only.** No hex classes, no new components, no second
   feedback mechanism, nothing that overrides `CLAUDE.md` § UI or
   `docs/ux.md`. `ux-check` green is the floor, in both modes.
3. **A "no" is an answer** and goes into `docs/app.md` with the date — same as
   every other declined menu in this template.
4. **The budgets are hard.** Two or three searches, one menu, one signature
   element. This skill is fifteen minutes, not an afternoon.
5. **The app icon is part of the look** but not of this skill's work: it is
   two PNG files the user replaces (`CLAUDE.md` § UI → *The app icon*). Name
   it once as the remaining placeholder, and move on.

## What comes next

- Inside `build-app` (step 1e) → hand back to **`build-app` step 2** (the data
  model). The pages built from step 3 onward follow `docs/design.md`.
- Standalone, on an app that already has pages → offer **`ux-gateway`**
  (check `kit`): it now audits the pages against `docs/design.md` as the
  baseline, and it is the pass that catches a page the recolour left behind.
- If `/` is still the shipped placeholder, say so once: a recoloured
  placeholder is still a placeholder — building the page that sells is the
  skill **`salespage`**, and it follows `docs/design.md` from its first line.
