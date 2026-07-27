---
name: compliance-check
description: The EU compliance check for this app — works out which rules actually reach it (GDPR, TDDDG §25, EU AI Act, DDG §5, consumer law, plus BFSG/DSA where they bite), fixes what can be fixed in code, writes the legal pages and the evidence pack, and leaves a dated report. Use it before go-live, when somebody asks "do I need a cookie banner?", "does the AI Act apply to me?", "what do I have to put in my privacy policy?", "can my customers delete their account?", or after adding anything that processes personal data. NOT legal advice — it prepares, a lawyer decides.
---
<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Compliance gateway — which rules reach this app, and what is still missing

This app sells to people in the EU. Before it does that for real, it gets
checked properly: **work out what applies → find what is missing → build it →
write the evidence → report.**

**This is not legal advice.** It prepares: it produces texts, records and code
so that a lawyer is reviewing something concrete instead of starting from
nothing, and it tells you which questions are genuinely yours to answer.

Two files carry the reasoning, and this skill **points at them rather than
repeating them** — two copies drift, and the copy in a skill is the one nobody
updates:

- **[`docs/compliance.md`](../../../docs/compliance.md)** — the map. Which
  regulation, from when, who is exempt, what in this app triggers it. **Read it
  first, every time.** Dates move; that file is where they are kept current.
- **[`docs/data-protection.md`](../../../docs/data-protection.md)** — the
  inventory. Every table holding personal data, every recipient, every retention
  window, read out of the code rather than remembered. A privacy policy is
  drafted from *that*, never from a checklist.

The standing rules for handling money, secrets and customer data live in
**`guardrails`**. Where this skill and that one disagree, `guardrails` wins.

## How to use this skill

Eight checks. You do not have to know which one you want.

| # | Check | What it looks at | Roughly |
|---|---|---|---|
| 1 | **`all`** | everything below, in order | 45–90 min |
| 2 | **`scope`** | which rules reach THIS app — six questions, then the rest follows | 10 min |
| 3 | **`pages`** | Impressum, privacy policy, and the terms — if they are yours | 20–30 min |
| 4 | **`ai`** | EU AI Act: your role, Art. 50 disclosure, Art. 4 literacy | 10–15 min |
| 5 | **`consent`** | § 25 TDDDG, marketing mail — and whether you need any at all | 10 min |
| 6 | **`rights`** | access, deletion, portability, objection — end to end | 10 min |
| 7 | **`evidence`** | the accountability pack (Art. 5(2)): records, TOMs, DPAs | 20–30 min |
| 8 | **`map`** | BFSG, DSA, Data Act — do they reach you yet? | 5 min |

**How to dispatch:**

- If the user already said what they want ("do I need a cookie banner?", "write
  my Impressum"), **start that check and skip the menu.**
- Otherwise show the table, say that **`all`** is what you run before go-live,
  and **wait**. A number, a name or a description all count.
- **You run the commands** — through your Bash tool, and you report what came
  back. Never hand a command to the user; the people here are not developers.
- **Look before you ask.** Almost everything is on disk: `config/`, `db/`,
  `content/legal/`, `docs/`, and `node run.mjs legal-check`. Ask only what
  genuinely leaves no trace — and `scope` is where those questions live, so
  every other check can assume they are answered.

Start every check with:

```bash
node run.mjs legal-check
```

It reports what is still a placeholder, whether the AI notice is in place,
whether a declared consent purpose has its wording, which evidence documents are
missing, and — the one nothing else can tell you — whether the retention jobs
have actually run.

## What counts as a finding

**Severity — what it costs if it stays:**

| | Severity | Meaning |
|---|---|---|
| 🚨 | **CRITICAL** | Unlawful right now, and somebody is affected. Personal data going somewhere with no basis, a deadline already passed. Stop and fix. |
| ❌ | **HIGH** | Fix before the app meets a customer. A missing Impressum, a missing privacy policy, an undisclosed AI. |
| ⚠️ | **MEDIUM** | Real, but it needs a second condition — a threshold you have not crossed yet, a feature you have not built yet. |
| ℹ️ | **LOW** | Hardening, or documentation that would help you later. |

**Confidence — only report what you can show.** A finding needs a file you have
actually read or a command you have actually run. Anything resting on an
assumption goes into **Worth a look** at the end of the report and is not
counted. In this domain a confident wrong finding is worse than in most: it
sends somebody to a lawyer with the wrong question and a bill.

**The format of a finding — the same everywhere, and the same as
`security-gateway`:**

```
❌ HIGH — The app has no privacy policy
   Where:    content/legal/datenschutz.de.md is still the shipped placeholder
   Why:      Art. 13 GDPR requires the information to be given at the time the
             data is collected — which here is the moment somebody signs up.
             The page currently tells visitors it has not been written.
   Fix:      Check 3 (`pages`) drafts it from docs/data-protection.md.
   Evidence: node run.mjs legal-check reports it as a placeholder.
```

Four lines, always in that order. **Why** says what actually goes wrong, in
plain words and with the article that says so — not "GDPR non-compliance".
**Fix** is a change somebody can make.

## 1 · `all` — the full pass

In this order. It is not arbitrary:

1. **`scope`** — everything else depends on its answers. Never skip it.
2. **`ai`** — the only check here with a deadline that has already passed
   (Art. 50, 2 August 2026). Cheap, and it either applies or it does not.
3. **`consent`** — decides whether check 3 has to describe a banner.
4. **`pages`** — the long one, and the one that needs the answers above.
5. **`rights`** — mostly verification: this template already implements them.
6. **`evidence`** — writes what is by then known, so it goes late.
7. **`map`** — five minutes, and it may change what the user does next quarter.

Then: one report, one summary, one honest list of what still needs a lawyer.

## 2 · `scope` — which rules reach THIS app

Read from disk first, and say what you found rather than asking about it:

| Question | Where the answer is |
|---|---|
| Is there an AI feature? | `config/ai-chat.json` (`enabled`), `config/ai-models.json`, `lib/ai/` |
| Which AI company receives data? | `node run.mjs ai-check` |
| Is there tracking? | grep `app/`, `components/` for analytics — the template ships none |
| What personal data is held? | `docs/data-protection.md` |
| Is the MCP interface on? | `config/mcp.json` |
| What is sold, and how? | `config/digistore-products.json` (`billingMode`) |

Then ask — and **only** these, in one message, because none of them leaves a
trace on disk:

1. **Who is the contracting party for the purchase — you or Digistore24 as
   reseller?** This decides whether AGB and the right-of-withdrawal notice are
   yours at all. It is in the Digistore24 contract, not in the code.
2. **How many people work in the business, and what is the annual turnover?**
   Two thresholds hang off this and nothing else: BFSG (under 10 **and**
   ≤ €2m → exempt for services) and the DSA transparency report (under 50
   **and** ≤ €10m → exempt).
3. **Consumers or businesses?** BFSG and the consumer-law duties are about
   consumers.
4. **Are 20 or more people constantly occupied with automated processing?**
   § 38 BDSG — a data protection officer becomes mandatory.
5. **Which country's law applies — where is the business established?** This
   file is written for Germany. Austria, Switzerland and the rest of the EU
   share the GDPR and the AI Act but differ on the Impressum and consumer rules.
6. **Does the app do anything the map calls high-risk?** Scoring applicants,
   assessing creditworthiness, gating an essential service. If yes, say plainly
   that this skill's map stops there and the obligations are a different order
   of magnitude (`docs/compliance.md` §3.5).

Write the answers into the report. Every later check reads them from there
rather than asking again.

**If the answer to 5 is not Germany**, say so once and clearly: the GDPR, the AI
Act, the DSA and the Data Act are EU regulations and apply as written, but
§ 5 DDG, § 25 TDDDG, § 147 AO, § 257 HGB and § 38 BDSG are German statutes with
local equivalents. Do not silently produce a German Impressum for an Austrian
business.

## 3 · `pages` — Impressum, privacy policy, terms

**What already exists:** `content/legal/<slug>.<locale>.md` holds the text,
`app/<slug>/page.tsx` is the route, `components/site-footer.tsx` links whatever
is there. Impressum and privacy policy ship as placeholders that say so on the
page; AGB and Widerruf ship as nothing at all.

**Adding a page needs both halves.** Write the markdown in **both** languages
and create the route beside the two that exist:

```tsx
// app/agb/page.tsx
import { LegalPage, legalMetadata } from "@/components/legal-page";

export const generateMetadata = () => legalMetadata("agb");

export default function Page() {
  return <LegalPage slug="agb" />;
}
```

Remove the `<!-- ds24-appkit:placeholder -->` marker from a file when you fill
it in — that marker is what `legal-check` and the warning box on the page read.

### The Impressum — § 5 DDG

The TMG was replaced by the **DDG on 14 May 2024**. Anything still citing § 5
TMG is citing a repealed act.

Ask for: name and legal form, address (**no PO box**), email **and** a second
fast contact route, register and number, VAT ID under § 27a UStG if held,
supervisory authority for a regulated trade, authorised representatives. For
journalistic-editorial content also a responsible person under § 18(2) MStV.

**Do not invent placeholders and move on.** An Impressum with `[FIRMENNAME]` in
it is worse than the shipped placeholder, because the shipped one announces
itself and a half-filled one does not. If the user does not have an answer now,
leave the placeholder in place and put it in the report.

### The privacy policy — Art. 13 GDPR

**Draft it from `docs/data-protection.md`, not from a checklist and not from a
generator.** That file was read out of the code. A generic policy will miss what
this app actually does, and the misses are not obvious:

- **IP addresses are processed** — in memory, fifteen minutes, to stop password
  guessing (§4). Nothing is stored, and processing without storing is still
  processing. Legitimate interest in securing the service is the basis that fits.
- **`ipn_events` holds the complete raw webhook body**, buyer data and all, for
  60 days (§3).
- **`email_changes` can hold a stranger's address** — a mistyped target — for up
  to 24 hours (§2).
- **Operator notes are personal data** (§3). The app never shows them to the
  customer; that is tone, not an exemption.
- **The AI company is the operator's choice**, not a fixed name (§5, §8).
  `node run.mjs ai-check` says which one. Naming the wrong one is worse than
  naming none.
- **Nothing about the person is sent to the AI** — no name, address, balance or
  purchase (§8). Worth saying, because customers ask.
- **Operator access to an account is recorded** and the customer may be told
  (§12).

If the app has grown since that file was written, **update it first**. A privacy
policy is only as true as the list it was drafted from.

### AGB and Widerrufsbelehrung — only if you are the seller

If Digistore24 resells, the purchase terms, the invoice, the VAT and the
right-of-withdrawal notice at checkout are theirs. Do not create a second set;
two sets of terms for one purchase is worse than one.

**Terms of USE of the app are yours either way** — what the subscription covers,
what happens on non-payment, what you may do with the account. None of that is
in Digistore24's purchase terms.

Where the user *is* the seller: for digital content the right of withdrawal
lapses early only with express consent **and** an acknowledgement that it is
thereby lost (§ 356(5) BGB), and the order button must be unambiguously labelled
(§ 312j(3) BGB).

## 4 · `ai` — the EU AI Act

Skip with one line if `config/ai-chat.json` says `"enabled": false` **and** the
user has built no other AI feature. Ask the second half; a feature they wrote
themselves is not in that file.

### Art. 50(1) — the disclosure. Applicable since 2 August 2026

Check it, do not assume it:

```bash
node run.mjs legal-check      # reports it directly
```

The notice is `chat.disclaimer` in both message files, rendered above the
transcript in both chat variants. `lib/ai/disclosure.test.ts` fails the build if
either language stops naming the assistant as an AI.

**The rule is not "the chat carries a notice".** It is: anything in this app
that talks to a person as a machine says so, at the latest at the first
interaction, clearly. If the user has built a second AI surface — a generator, a
form assistant, an email writer — it needs its own, and that is a finding.

Do **not** lean on the "obvious to a reasonable person" exception for an
assistant with a human name and a face. That is the case the exception was
written to exclude.

### The role — provider or deployer?

`docs/compliance.md` §3.2 has the reasoning. The short version for this
template: an assistant with a name you chose, a persona in `lib/ai/prompt.ts`, a
handbook in `content/knowledge/` and a purpose you defined is **a system you
offer**, not somebody else's system you happen to use. Assume **provider** until
an advisor says otherwise — it is the larger duty set, and assuming the smaller
one is the expensive mistake.

### Art. 4 — AI literacy. In force since 2 February 2025

Documented measures, proportionate to the role. No prescribed curriculum. For a
solo operator this is short — but short is not absent, and the document is the
point. Write `docs/compliance/ki-kompetenz.md` (check 7).

### Risk class

Nothing this template ships is high-risk. If the answer to `scope` question 6
was yes, say so in the report in its own paragraph: the deadline is
2 December 2027 and the obligations are a different order of magnitude.

## 5 · `consent` — § 25 TDDDG and marketing

**Start from the shipped answer, which is "none needed", and try to disprove
it.** This app sets three cookies — session, language, theme — all strictly
necessary or set by the user's own click, and ships no analytics, no pixel, no
advertising SDK.

```bash
grep -ril "gtag\|googletagmanager\|plausible\|posthog\|matomo\|mixpanel\|segment\|fbq\|hotjar\|clarity" app components lib package.json
```

**If that comes back empty, the finding is: no consent banner is needed, and
adding one would be a defect.** Say it in those words. Under § 25 TDDDG a banner
where nothing touches the device asks for permission the app neither needs nor
uses, and it trains people to click past the one that will later matter. This is
the single most common thing a generator gets wrong, and the user has probably
been told the opposite.

**A purchase needs no consent either.** It runs on Art. 6(1)(b) — performance of
a contract. The thank-you page deliberately prompts for nothing.

**Where something genuinely does need consent** — an analytics tag, a marketing
mail (§ 7 UWG), a transfer beyond what the product requires:

1. Declare the purpose in `config/consent.json` (`key`, `textVersion`).
2. Write `consent.<key>.title` and `.body` in **both** message files.
   `i18n/messages.test.ts` checks it; `legal-check` reports it.
3. Ask with `<ConsentDialog>` and record with `recordConsent()`.
4. Gate the thing itself on `hasConsent(memberId, key)` — in front of the tag,
   not in front of the button that triggers it.

Three properties of that machinery are load-bearing and worth explaining to the
user rather than just using:

- **Refusing is as easy as agreeing.** Two equal buttons, no pre-ticked box, no
  grey decline link. Art. 7(1) and (4) ask whether consent was freely given.
- **A refusal is recorded** and stops the asking. Re-asking somebody who
  declined is what turns a dialog into pressure.
- **`textVersion` is the load-bearing field.** Change the wording, bump the
  version, and everyone who agreed to the old sentence correctly counts as
  unasked again. That is inconvenient and it is the honest answer.

Never build a second consent store beside `lib/consent/`.

## 6 · `rights` — what a person may demand

Mostly verification: this template implements them. Check each, and report the
one that is genuinely open.

| Right | Art. | Where | Verify by |
|---|---|---|---|
| Information | 15 | member's own download; `node run.mjs data-export --email …` | run the command |
| Rectification | 16 | `/dashboard/account`, and the Operator's user page | open the page |
| Erasure | 17 | account deletion, both self-service and Operator | read the dialog text |
| Restriction | 18 | blocking the account | — |
| Portability | 20 | the same JSON | run the command |
| Objection | 21 | only bites once something runs on legitimate interest | — |
| No automated decision | 22 | this app makes none | `docs/data-protection.md` §14 |

**The two exports must not drift.** The member's own download omits the raw
webhook bodies (they can carry a third party's data and nobody is in between to
redact them, Art. 15(4)); everything else is identical, and
`lib/privacy/export.test.ts` fails the build if one grows a table the other
lacks. If the user has added a table, that test is what catches it — run it.

**The deletion carve-out has to be in the privacy policy, in plain words.**
Orders and `ai_usage` survive with the member link removed, because § 147 AO and
§ 257 HGB require them and Art. 17(3)(b) exempts exactly that. "We delete
everything" is a promise the app does not keep and did not need to make.

**The genuinely open question** (`docs/data-protection.md` §6): nothing deletes
an order once its retention period has actually run out. Correct in year one,
wrong by year eleven. Put it in the report as a decision the user has to make,
not as a bug.

**One month** to answer (Art. 12(3)), extendable by two with reasons.

## 7 · `evidence` — Art. 5(2), accountability

Being compliant is not enough; you have to be able to **show** it. Seven
documents, into `docs/compliance/`, **derived from the code rather than from a
template** — that is what makes them worth having and what a template cannot do:

| File | What | Derive from |
|---|---|---|
| `verarbeitungsverzeichnis.md` | record of processing (Art. 30) | `docs/data-protection.md` + `config/ai-models.json` + the mail and host setup |
| `tom.md` | technical and organisational measures (Art. 32) | the real ones: scrypt hashes, SHA-512 IPN signature, `lib/rate-limit.ts`, `requireOwner()`, `readOnly` as the MCP boundary, no IP storage |
| `loeschkonzept.md` | deletion concept | the windows in `lib/cron/jobs.ts`; the proof is `node run.mjs cron --list` |
| `avv-register.md` | processor agreements (Art. 28) | recipients from `docs/data-protection.md` §5, with the AI company actually in use |
| `ki-register.md` | AI systems, role, risk class, Art. 50 measures | check 4 |
| `ki-kompetenz.md` | AI literacy measures (Art. 4) | ask the user what they did |
| `datenpanne.md` | breach procedure (Art. 33/34) | write it now, not during one |

Two things to get right:

- **The record of processing is not optional for a SaaS.** The Art. 30(5)
  exemption falls away as soon as processing is regular, which it is by
  definition here.
- **`datenpanne.md` has a clock in it: 72 hours** to the supervisory authority.
  A procedure written during an incident is a procedure written badly. Name who
  decides, who they call, and what gets written down.

`node run.mjs legal-check` lists which of the seven are missing.

## 8 · `map` — what else could reach you

Five minutes, no building. Answer each with *reaches you / does not reach you
yet / and here is what changes it*, using the `scope` answers.
`docs/compliance.md` §6 has the detail.

- **BFSG / accessibility** — in force since 28 June 2025. § 3(3) BFSG exempts
  micro-enterprises **offering services**, and a SaaS is a service: under 10
  people **and** ≤ €2m turnover means out of scope. **Say what happens when they
  cross it**, because that is the point of mentioning it a year early: the whole
  customer-facing interface measured against WCAG 2.1 AA is a project, not a
  checkbox.
- **DSA** — the contact point for users **and** for authorities reaches every
  intermediary including micro-enterprises; the contact route may not be a
  chatbot alone. Transparency reports only from 50 people **and** €10m.
- **Data Act** — applicable since 12 September 2025. The part that reaches a
  SaaS is switching and data portability for business customers.
- **NIS2** — sectoral and size-gated; normally outside. If they sell into
  critical infrastructure, say so and stop.

## The report

Into `docs/reports/compliance-<YYYY-MM-DD>.md`, always, even when everything
passes — "have we already done that?" needs an answer next month. Structure:

1. **Scope** — the six answers, dated. Everything else depends on them.
2. **Findings** by severity, in the four-line format.
3. **What was built** in this run — files created, pages filled, purposes declared.
4. **Accepted risks**, if the user accepted any (same table as
   `security-gateway`: risk, where, why accepted, by whom, when, review when).
   Only the user accepts a risk, never you, and never silently.
5. **Still needs a human** — the honest list. See below.

## STOP — get a lawyer, not a better prompt

Prepare these, do not decide them:

- **AGB, the right of withdrawal, and anything about tax.**
- **Special categories of data** (health, beliefs, biometrics, trade union
  membership) — Art. 9, and a different regime.
- **Data about children.**
- **Anything the map calls high-risk under the AI Act** (`scope` question 6).
- **A suspected data breach.** That has a 72-hour clock on it — go to
  `docs/compliance/datenpanne.md` and to a human, in that order.
- **Any app not established in Germany**, for the national statutes.

And say this once, plainly, at the end of every run: **nothing here is legal
advice.** What it produces is material for a review, and the review is worth
buying — it is cheaper than the letter that comes otherwise.

## Next step

After the compliance gateway: **`go-live`** (which runs `legal-check` in its
pre-flight), then **`go-to-market`**.

If `ux-gateway`, `security-gateway` and `performance-gateway` have not run yet,
they come first: a lawful app that leaks customer data is not a lawful app, and
one whose customers cannot find what they paid for is a refund queue with a
privacy policy on it.
