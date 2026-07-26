---
name: market-research
description: Start here if you do NOT yet have a clear SAAS idea (or want to sharpen it). Interviews you about expertise, interests and existing reach, suggests target audiences, researches their situation and challenges and derives from that a concrete SAAS product idea that can be sold through Digistore24. Leads into a product brief and hands over to build-app.
---
<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# From the idea to a product proposal (market research)

Goal: derive a **concrete SAAS product** from what **you** are good at or can
reach, one that a real target audience needs — and that can be sold through
Digistore24 (digital products, courses, memberships, tools).

Guide the user **step by step** through the following phases. Ask questions with
the question tool (AskUserQuestion), summarize briefly after every phase and
have it confirmed before you move on. Don't invent facts — research them.

## Phase 1 — Interview: the starting point

Ask questions (in 1–2 rounds) to understand expertise, motivation and assets:
- **Expertise/background:** What do you really know your way around in
  (professionally, hobby, problems of your own you have solved)?
- **Existing idea:** Do you already have a product idea or target audience in
  mind?
- **Reach/assets:** Do you already reach people (email list, social media,
  community, customers)? That often decides success.
- **Goal & scope:** Side income or main business? How much time? One-off
  purchase or subscription preferred?

Summarize the answers as a short profile and have it confirmed.

## Phase 2 — Target audience candidates

Derive **2–4 concrete target audiences/niches** from the profile (specific, not
"all self-employed people", but e.g. "alternative practitioners who sell courses
online"). For each candidate name briefly: who, why you can credibly serve them,
and whether experience shows they pay for digital products.

Have the user **choose one target audience** (or add one of their own).

## Phase 3 — Research: situation & challenges

Research the chosen target audience **with real sources**. Use web search
(WebSearch/WebFetch); if the `deep-research` skill is available, use it for a
deeper, source-backed analysis. Clarify:
- **Situation & workflows:** How do these people work today? What do they earn
  with?
- **Pain points:** Which recurring problems, time sinks, frustrations?
- **Existing solutions & gaps:** What do they already use, what is missing?
- **Willingness to pay:** What do they already spend money on (courses, tools,
  templates)?

Summarize the findings **with source references** (3–6 key points). Prioritize
one or two problems that are frequent, painful and solvable.

## Phase 4 — Product proposal

Derive **one concrete SAAS proposal** from that (2 variants to choose from if
needed):
- **Problem** (one clear statement) and **target user** (from phase 2).
- **Value proposition** in one sentence.
- **MVP feature scope:** 3–5 core features — **deliberately small** and
  buildable on this template (auth + data model + a few pages, access tied to
  the purchase).
- **Digistore billing:** What is the "product"? One-off purchase, subscription
  or membership? How does the purchase unlock the value (the IPN records it, the
  app asks the entitlement API — see `docs/entitlements.md`)?
- **Name suggestion** (optional).

Check the proposal against `guardrails` (money, customer data, secrets) and
point out open issues (e.g. legally sensitive data).

Present the proposal and **iterate** until the user is satisfied.

## Phase 5 — Handover to the build

Write the result into a short **product brief** at `docs/product-brief.md`
(problem, target user, value proposition, MVP features, billing model, sources).
Then continue with the skill **`build-app`** (archetype, data model, pages) and
**`setup-digistore`** (connecting the billing).

## Principles

- **Research instead of guessing:** back up statements about the target audience
  with sources.
- **Start small:** an MVP that stands on this template within a manageable time
  beats the grand castle in the air.
- **Take reach seriously:** a target audience you can reach is worth more than
  the "bigger" market opportunity without access.
- **Fit the sales model:** Digistore24 is strong with digital products, courses,
  memberships and tools — aim the proposal at that.
