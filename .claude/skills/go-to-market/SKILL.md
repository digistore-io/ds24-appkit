---
name: go-to-market
description: Advises the user on bringing their finished SAAS product to market. Works out positioning and price, picks channels that fit the reach they already have (including Digistore affiliates), creates a simple launch plan and delivers ready-made content — landing page copy, an e-mail sequence, social posts and video scripts (hook → problem → solution → CTA). Use this when the app is done and is meant to be sold.
---
<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# From product to market (go-to-market)

Goal: win the first paying customer — with a **simple, concrete** plan and
**ready-made content** the user can put to work right away. Build on the
`docs/product-brief.md` (from `market-research`) if it exists.

Work through this step by step. Ask (AskUserQuestion), propose, deliver
something finished.

## Phase 1 — positioning & price

- **Core message** in one sentence: "[target audience] achieves [outcome] without [pain]."
- **Offer & price:** what exactly is being sold (course, membership, tool access)?
  One-off purchase or subscription? Name a price anchor (oriented on the target
  audience). For a subscription, possibly a yearly discount. The billing runs
  through Digistore (`setup-digistore`).
- **Offer amplifiers:** bonus, guarantee, scarcity (use them honestly).

## Phase 2 — channels (matched to the reach)

Ask about the existing reach and pick **1–2 channels** (not all of them at once):
- **Own list / community** — the fastest way, if it exists.
- **Social (organic)** — short-form video/posts; good for building reach.
- **Digistore affiliates** — partners sell for a commission. `createBuyUrl`
  supports affiliate commissions; a marketplace listing brings reach without an
  audience of your own. For many Digistore vendors the most important lever.
- **Content/SEO** — medium-term, if search intent exists.
- **Paid ads** — only with a budget and a clean funnel; not for the very first start.

## Phase 3 — launch plan (simple)

A lean sequence instead of a big launch:
1. **Preparation:** landing page + checkout link (`setup-digistore`) live, opt-in page checked.
2. **Announcement:** 2–3 touchpoints before sales open (list/social).
3. **Open sales:** clear deadline/CTA.
4. **Follow up:** reminder, resolve objections, social proof.
5. **After the launch:** collect feedback, roll out the affiliate program.

## Phase 4 — create content (ready to use)

Produce concrete content and put it under `docs/marketing/`:
- **Landing page copy:** headline, subheadline, problem, benefits/features, social proof,
  price, FAQ, clear CTA (linking the Digistore checkout).
- **E-mail sequence:** 3–5 mails (announcement → benefit/story → social proof →
  last chance). Subject lines included.
- **Social posts:** 5–10 short posts/hooks for the chosen channel.
- **Video scripts:** at least
  - one **short-video script** (30–60 s) following the pattern **hook → problem →
    solution → proof → CTA**, with scene/spoken text;
  - optionally a **VSL/explainer script** (2–3 min) for the landing page.
  Write spoken text the user can record word for word; keep it concrete and in
  the language of the target audience.

Adapt the tone to the target audience. Do not invent false claims/
testimonials — mark placeholders (e.g. "[insert real customer quote]").

**One thing to say once, when this phase is finished:** if `app/page.tsx` and
the plans page still carry the template's placeholder wording while this
document carries the real headline and the real promise, the visitor reads the
weaker version. Putting it there is ordinary work, not a skill. The video is
different — a script written here becomes a file, and a file wants somewhere to
live and a player: that part is **`visuals`** (check `upload`).

## Phase 5 — measure & iterate

Name 2–3 simple metrics (visitors → checkout clicks → purchases) and how to see
them (Digistore statistics). Recommend one small improvement per week.

## Principles

- **One channel, one offer, one clear CTA** — focus beats breadth at the start.
- **Use the reach that is already there**, before building new reach.
- **Honest marketing** — no made-up results/reviews (a legal matter, too).
- Next step after the launch: look at the metrics, sharpen the offer/content.
