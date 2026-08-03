<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# `secrets` and `deps` — the check recipes

Part of the skill `security-gateway`, checks 4 (`secrets`) and 5 (`deps`).
SKILL.md holds the rule that keeps each check honest and the command it starts
from; this file holds how to run them. Severities and the format of a finding
are defined in SKILL.md.

## 4 · `secrets` — what must never be in git

**Run the tools you have.** `gitleaks detect --source . --verbose` if it is on
the machine — the template ships a `.gitleaks.toml` for it. Otherwise work from
`git grep` and the checks below; the discipline does not depend on the tool.

**Skip these without further checking** — they are not secrets:

- Anything containing `_test_`, `_sandbox_`, `test-`, `sandbox-` — sandbox keys
  move no money.
- Publishable and public keys: `pk_live_*`, `pk_test_*`, `-----BEGIN PUBLIC KEY-----`,
  `ssh-rsa`/`ssh-ed25519`, any `*.pub`.
- **`BUILT_IN_DEVELOPER_KEY` in `scripts/ds24/connect-api-key.mjs`.** A
  Digistore24 developer key carries no account permissions — it only identifies
  the application to `requestApiKey`, like an OAuth client ID. The key that
  carries permissions only comes into being when the merchant grants access. Do
  not remove it, do not obscure it; the scanner markers on that line are part of
  it. A scanner *will* raise this. It is not a finding.
- The placeholder values in `.env.example`.

**Do check** `sk_live_*`, `-----BEGIN … PRIVATE KEY-----`, and any secret sitting
in a `NEXT_PUBLIC_*` variable — that prefix ships the value to every browser, so
a real key there is **CRITICAL** whatever else is true.

**For everything left, verify the value:**

```bash
git grep '<distinctive tail of the value>'                    # in the tree now?
git log -p --all -S '<distinctive tail of the value>' -- <file>   # ever in history?
```

Search a distinctive tail, not the whole key. Then:

| In the tree now | In history | Rotated | Verdict |
|---|---|---|---|
| yes | — | — | 🚨 **CRITICAL** — it is in the repo right now |
| no | yes | no / unknown | ❌ **HIGH** — it was exposed and still works. Rotate it. |
| no | yes | yes | **no finding** — the old value is dead. Cleaning history is hygiene, offer it. |
| no | no | — | **no finding** — this is what correct looks like |

When rotation is unclear, **ask** — one sentence: "was this key rotated at the
provider after it was committed?" Do not guess CRITICAL.

Also check, regardless of tools:

- `.env` is in `.gitignore` and `git log --all -- .env` is empty.
- Every new variable is in `.env.example`, with a placeholder and never a value.
- The Digistore24 credentials live in the environment and are read through
  `lib/digistore/settings.ts` — not in the database, not in the code. There is
  deliberately **no UI for entering keys**, and adding one is a finding: it is
  attack surface for a problem that does not exist.
- Nothing secret in `messages/de.json` / `messages/en.json` — they are bundled.

**The fix, when it is real:** rotate at the provider first, then remove from the
code, then `.gitignore`, then clean the history (`git filter-repo`, BFG). In that
order. Cleaning history first leaves a live key out there.

## 5 · `deps` — the packages

For the ones that do ship:

- Fix by update. `npm audit fix` for the easy half; a pinned major for the rest.
- After any update: `node run.mjs test`. An update that breaks the build is not
  a fix.
- A transitive dependency with no fixed version goes in `overrides` in
  `package.json` — the template already uses that mechanism. **Two packages are
  excluded from it**, see below.
- Framework versions current and patched: Next.js and `next-auth` above all.
  A Next.js version behind a security release is **HIGH** on its own.

Severity comes from npm, but judge it against this app: a ReDoS in a package
that only ever parses your own config is not the same as one in the request
path. Say which it is.

**One set of findings is already known, and it is not yours to fix.** A plain
`npm audit` on this template reports nine high findings in the eslint chain
(`brace-expansion`, GHSA-mh99-v99m-4gvg). Report them as **known, dev-only,
accepted** — with `npm audit --omit=dev` clean as the evidence — and move on.
Do not spend the check re-deriving them, and above all do not fix them:

- **`overrides: { "minimatch": "^10" }` takes the count to zero and breaks the
  linter.** minimatch 10's CommonJS build is not callable, and three
  `eslint-config-next` plugins call it. This app's own `npm run lint` stays
  green, so the damage is invisible here and lands on whoever enables one of
  those rules later. `scripts/deps.test.ts` fails on it.
- **`eslint@10`** (what `npm audit fix --force` proposes) reaches 6 of the 9 and
  adds three `ERESOLVE` conflicts.

The full reasoning, with the measurements, is in `scripts/deps.test.ts` and in
`CLAUDE.md` → **What the first install prints**. A finding you decide to accept
goes in the report with that decision written next to it — an accepted finding
with no reason recorded is one the next run raises again.
