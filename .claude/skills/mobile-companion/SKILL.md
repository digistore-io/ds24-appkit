---
name: mobile-companion
description: Sets up a mobile app on this app's backend — switches the HTTP API on, decides which endpoints the companion needs, exports the shared core into the companion repo and wires its imports, so a separate Expo/React Native app reads and writes the same accounts, entitlements and balances — and ships it through Expo's EAS (cloud builds, managed signing, store submission, OTA updates, push). Use this when the user says "I want an app for my phone", "a mobile app for my customers", "publish to the app store", mentions Expo, React Native, EAS, push notifications, signing certificates, or asks how another program can talk to this app on a member's behalf.
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

## Step 4 — ship it: Expo + EAS

The reasoning and the full path live in
[`docs/mobile.md`](../../../docs/mobile.md) → *Shipping the companion — Expo
and EAS*; read that section before this step. The short of it: EAS does the
signing, the builds (in the cloud — no Mac needed for iOS), the store upload,
OTA updates and push, all as CLI commands you run yourself.

1. Ask ONE question: into the stores now, or develop locally first? Local
   development needs none of this — Expo Go on the owner's phone runs the app
   against the local backend today; come back to this step when the stores
   are wanted.
2. Scaffold the app if step 3 has not already: `npx create-expo-app@latest`
   in the companion repo, then the wiring from step 3 on top.
3. Name the one human step and wait for it: an Apple Developer Program
   membership and a Google Play Console account (both paid — have the user
   check the current fees), each connected to EAS once via `eas credentials`.
   About half an hour, once ever — after it, nobody touches a certificate
   again. Only the account owner can do this part; sit with them through it.
4. Then you run the rest and report what comes back: `npx eas-cli init`,
   `eas build --platform all`, `eas submit --platform all`. Say plainly what
   stays manual: store listing, screenshots, and a first-submission review
   that takes days. Later JS-only changes go out in minutes with
   `eas update` — no review.
5. Push notifications, if wanted: `expo-notifications` on the device; the
   backend needs a push-token endpoint that does not exist yet — build it
   exactly as [`docs/api.md`](../../../docs/api.md) → *Adding an endpoint*
   prescribes (the doc's *Push notifications — the server half* names the
   rules; never accept a member id in the payload).

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
