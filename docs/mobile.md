<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# The mobile companion — one backend, a shared core

A mobile app for this product is a **separate repo with its own UI** — it is
not this codebase compiled twice. What the two share is deliberate and narrow:

1. **The backend.** The mobile app talks to this app's HTTP API
   ([`docs/api.md`](api.md)) — same database, same entitlements, same billing,
   because there is only one of each.
2. **The shared core.** The pure decision layer — product registry, prices,
   entitlement and token rules, locale negotiation, key-shape checks — copied
   into the companion repo by `node run.mjs export-core`, so both apps make
   the same decisions from the same code instead of two hand-kept copies.

The web UI transfers **nothing** (it is DOM, Tailwind and Server Actions),
and that is fine: the companion brings its own screens. The skill that walks
through all of it is `mobile-companion`.

---

## The short version

| | |
|---|---|
| The backend | switch on the API: `config/api.json`, [`docs/api.md`](api.md) |
| The core | `node run.mjs export-core ../my-app-mobile/core` — plan first, `--apply` writes |
| What is in it | `config/core-export.json` — the explicit list, nothing else ever goes out |
| The stamp | `.core-version` in the target — a file you changed there is yours, re-exports keep it |
| The admission test | `scripts/core/purity.test.ts` — a core file imports no react/next/db/node/env |
| Consumer wiring | tsconfig `"@/*": ["./core/*"]` — exported files keep their template layout |
| Shipping | Expo + EAS: cloud builds, managed signing, `eas submit`, OTA via `eas update` — see *Shipping the companion* below |

---

## Exporting the core

```bash
node run.mjs export-core ../my-app-mobile/core            # what would change — writes nothing
node run.mjs export-core ../my-app-mobile/core --apply    # write it
```

The first form prints a plan (`new` / `update` / `unchanged` / `keep` /
`withdrawn`); nothing is written without `--apply`, and what is written shows
up in the companion repo's `git diff` — readable, keepable, revertible. The
target must be OUTSIDE this app; exporting into the app's own tree is
refused.

Re-running is the update mechanism. The rules are `node run.mjs update`'s
rules (see [`docs/updates.md`](updates.md)), applied to code:

- **A file you changed in the companion repo is yours.** `.core-version`
  records the hash each file had when it was exported. Only files that still
  match get replaced; the rest are reported as `keep (edited in this app)`
  and left alone — so a shim or fix you made locally survives every
  re-export. Do not "fix" that by overwriting anyway.
- **Nothing is deleted.** A file that left the manifest is reported
  `withdrawn` and stays — deleting it is your decision.
- **No timestamp in the stamp.** Same input, same output; the stamp diffs
  only when content did.

One thing `node run.mjs update` does that this deliberately does not:
`update` reaches every existing clone, because it refreshes text from the
public repo. `export-core` is CODE and lives in this repo — an app cloned
before it existed updates its tooling by taking the template's new code, not
via `update` (which never touches code).

## Wiring the companion repo

Exported files keep their template-relative layout (`core/lib/digistore/…`,
`core/i18n/config.ts`) and their `@/` imports — **byte-identical to the
template**, which is what makes the hash stamp meaningful. The companion maps
the alias instead of rewriting files:

```jsonc
// my-app-mobile/tsconfig.json
{
  "compilerOptions": {
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./core/*"] }
  }
}
```

Expo SDK 50+ honours tsconfig paths natively; older React Native setups use
`babel-plugin-module-resolver` with the same mapping. Two lines of hygiene
that pay for themselves: put `* text=auto eol=lf` in the companion's
`.gitattributes` (the stamp hashes are CRLF-safe, but LF keeps every diff
honest — the same lesson this template's own `.gitattributes` records), and
treat `core/` as generated: edit there only when you mean to fork a file.

Then the app signs in against the backend and stores its key
([`docs/api.md`](api.md) → *Getting a token*):

```ts
import { looksLikeKey } from "@/lib/api-keys/rules";   // shared shape check
import { allProducts, formatPrice } from "@/lib/digistore/products";
```

## What is in the core — and what is kept out

`config/core-export.json` is the whole answer: an explicit, sorted list —
no globs, so adding a file is a deliberate, reviewable act. Shipped v1:
the Digistore24 domain model (`products`, `plan-sections`, `next-payment`,
`billing-mode`, the product registry JSON), the entitlement/token/user rules,
`i18n/config.ts` (locale list + Accept-Language negotiation), `lib/roles.ts`,
`lib/rate-limit.ts`, `lib/api-keys/rules.ts`.

**Kept out on purpose — do not add these:**

- **Anything that signs or holds secrets** (`lib/digistore/client.ts`,
  `ipn.ts`, `buyUrl.ts`). Signing code in a mobile bundle is an invitation to
  embed the secret beside it, and a mobile binary is public. Checkout URLs
  and purchase state come from the backend API, where the keys live.
- **Anything that touches the database** (`*/manage.ts`, `db/`). The mobile
  app has no database; it has an API.
- **Anything reading `process.env` or Node builtins.** The companion repo has
  neither this app's `.env` nor its runtime.
- **The web app's texts** (`messages/*.json`) — the companion has its own
  strings; only the locale machinery is shared.

## Adding a file to the core

1. Add the path to `config/core-export.json` (sorted).
2. Run `node run.mjs test` — `scripts/core/purity.test.ts` is the admission
   test: the file and its whole import closure must be in the manifest, free
   of react/next/db/node-builtin/npm imports, `process.env`, `require()` and
   dynamic `import()`. **Never silence it with the `core-pure-ok` marker to
   get green** — the marker is for a line that only *looks* impure. The
   honest fixes are: cut the import, extract the pure part into its own
   module, or leave the file out.
3. Re-export. Consumers pick the file up as `new`.

**Renaming or deleting a manifest file is a breaking change** for every
exported copy — the next export reports it `withdrawn` and the companion's
imports of it go red. Treat manifest paths with the same care as API routes.

## Shipping the companion — Expo and EAS

Once the companion runs against the backend, getting it **into the app
stores** is its own craft — and the traditional version of it (certificates,
provisioning profiles, a Mac for the iOS build, store uploads by hand) is
exactly the kind of work this template exists to take off people. The
recommended path is **Expo with EAS** (Expo Application Services), and the
recommendation is load-bearing, not a taste:

- **Nobody handles certificates.** `eas credentials` creates and stores the
  signing material for both stores; no keystore on a laptop, no provisioning
  profile to renew by hand. This is the single biggest source of failed first
  releases, removed.
- **Builds run in EAS's cloud** — an iOS build does not need a Mac. That
  matters here for the same reason the rest of this template runs on three
  systems: a developer on Linux or Windows can ship to the App Store.
- **Everything is a CLI command**, so your agent can run it and read the
  output back — the same way it runs `node run.mjs` here: `eas build`,
  `eas submit`, `eas update`.
- **OTA updates come with it.** `eas update` pushes JavaScript changes to
  installed apps without a store review — fixes reach customers in minutes,
  not days. Native changes (a new library with native code) still need a
  store build.
- **Push notifications come with it** — `expo-notifications` on the device,
  Expo's push service behind it, no per-platform Firebase/APNs plumbing.

### The one-time setup — about half an hour, then never again

Two accounts have to exist, and each is connected to EAS **once**:

| | What | Who can do it |
|---|---|---|
| Apple | an Apple Developer Program membership (paid, yearly — check the current fee) | only the account owner — this is the human step |
| Google | a Google Play Console account (paid, one-off — check the current fee) | only the account owner — this is the human step |
| EAS | an Expo account, then `eas credentials` connects both of the above | the agent walks through it with the owner present |

After that, signing, building, uploading and push all run through the
connected accounts — the certificates question never comes back.

### The path

```bash
npx create-expo-app@latest .        # in the companion repo (see Wiring above)
npx eas-cli init                    # link the repo to an EAS project
eas build --platform all            # cloud build, both stores
eas submit --platform all           # upload to App Store Connect / Play Console
eas update                          # later: OTA for JS-only changes
```

What stays manual, honestly: the store listing (name, description,
screenshots, privacy declarations) and the review wait — both stores review
first submissions in days, not minutes. Plan the first release around that;
`eas update` is why most later releases do not have to be.

### Push notifications — the server half

The device side is `expo-notifications`: it yields a push token per install.
The server side is this app's job — a member's devices are rows the backend
has to know about, so the companion needs an endpoint that stores and removes
push tokens for the authenticated member. That endpoint is **not shipped**;
build it the way every other endpoint is built —
[`docs/api.md`](api.md) → *Adding an endpoint*: logic in `lib/`,
`guardApi()`-first handler, no member id in the payload (the token belongs to
the key's owner), colocated test. Sending then goes from your server to
Expo's push API with the stored tokens.
