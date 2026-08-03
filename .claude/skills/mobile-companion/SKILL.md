---
name: mobile-companion
description: Sets up a mobile app on this app's backend — switches the HTTP API on, decides which endpoints the companion needs, exports the shared core into the companion repo and wires its imports, so a separate Expo/React Native app reads and writes the same accounts, entitlements and balances. Use this when the user says "I want an app for my phone", "a mobile app for my customers", mentions Expo, React Native, an app store, or asks how another program can talk to this app on a member's behalf.
requires: 0.11.0
---
<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# The mobile companion — one backend, a second front door

A mobile app for this product is a **separate repo with its own UI**. It is
not this codebase compiled twice, and nothing of the web UI transfers — that
is the design, not a limitation. What the two share is the backend (the HTTP
API, [`docs/api.md`](../../../docs/api.md)) and the **shared core** — the
pure decision layer, exported by `node run.mjs export-core`
([`docs/mobile.md`](../../../docs/mobile.md)).

The two reference docs carry the full story; this skill is the order to do
things in and the questions to ask. Point at the docs, do not restate them.

**You run the commands** — through your Bash tool, reporting what came back.

## Step 0 — is a companion wanted, and is there one already?

Ask, in one sentence each, if the answers are not already on disk:

1. **Is a mobile (or other external) app actually planned?** If the user only
   wants "an API" for integrations or AI clients, check whether `mcp-server`
   is the better fit — an MCP connector is for AI programs, `/api/v1` is for
   the customer's own software. Both can coexist.
2. **Does a companion repo already exist?** Look for a `.core-version` file
   in sibling directories the user names. If one exists, this skill's later
   steps UPDATE it (re-export, re-check) rather than create it.

If the app itself is still unbuilt, stop — `build-app` comes first; a
companion needs something to accompany.

## Step 1 — switch the API on and scope it

1. Read [`docs/api.md`](../../../docs/api.md) in full — especially *Every
   route guards itself* and *What this is not*.
2. Set `"enabled": true` in `config/api.json`. Ask ONE question first: is the
   API for every member, or a paid feature? A paid feature sets
   `"requiresPlan"` to a Product Key from `config/digistore-products.json`
   (never a token package).
3. Walk the endpoint table in the doc against what the companion will show.
   The shipped surface mirrors the dashboard (me, entitlements, tokens,
   billing, chat, media). If a screen the user describes needs something that
   is not there, follow *Adding an endpoint* in the doc — logic into
   `lib/<domain>/`, thin `guardApi()`-first handler, colocated test.
4. `node run.mjs test`, then `node run.mjs start` and
   `node run.mjs api-check --live` — it mints a temporary key, really calls
   `/api/v1/me` and revokes; report its output. Only a green `--live` proves
   the whole path.

## Step 2 — export the shared core

1. Ask where the companion repo lives (or create the folder beside this one:
   `../<app-name>-mobile`). The export target is a `core/` folder INSIDE it.
2. `node run.mjs export-core ../<name>/core` — show the user the plan, then
   run it again with `--apply`.
3. Say the one sentence that prevents later grief: **files edited inside
   `core/` are the companion's own from then on** — re-exports keep them and
   say so (`.core-version`, [`docs/mobile.md`](../../../docs/mobile.md)).

## Step 3 — wire the companion and prove it

1. In the companion repo: tsconfig `"baseUrl": "."`,
   `"paths": { "@/*": ["./core/*"] }`, `"resolveJsonModule": true` (Expo
   SDK 50+ reads it natively; the doc names the Babel fallback for older
   setups). Recommend `* text=auto eol=lf` in its `.gitattributes`.
2. Prove the wiring with one shared module before building screens: a file
   that imports `allProducts()` from `@/lib/digistore/products` and prints
   the plan list must typecheck and run in the companion.
3. Prove the backend the same way: sign in against
   `POST /api/v1/auth/token` (or paste a key from `/dashboard/account` for a
   magic-link account) and call `GET /api/v1/me`. A `404` means the API is
   still off — back to step 1.
4. From here the companion is ordinary app development in its own repo. What
   this template keeps owning: the API surface, the core's contents
   (`config/core-export.json`), and the re-export whenever the core changes.

## When something does not fit

- **"The companion needs a price/rule that lives here"** — add the module to
  the core if it passes the purity test, otherwise expose it through an
  endpoint. [`docs/mobile.md`](../../../docs/mobile.md) → *Adding a file to
  the core* names the admission rules; never weaken the purity test to force
  a file in.
- **"Can the app change the user's email / buy things?"** — no, deliberately:
  email changes ride a mail confirmation, purchases ride Digistore24's
  checkout. The companion links to the web app for both.

End by naming the next step: if the app has not been through the gateways
yet, `ux-gateway` → `security-gateway` for the web app remain the path; the
API surface is covered by `security-gateway`'s route checks the next time it
runs.
