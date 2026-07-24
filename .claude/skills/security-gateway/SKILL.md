---
name: security-gateway
description: Security gateway before the launch. Systematically scans the app for vulnerabilities (auth holes, unprotected routes, secrets in the code, IPN/signature bypasses, missing access control/IDOR, XSS, vulnerable dependencies) and fixes the findings. Use this before the app processes real payments and customer data, and after larger changes.
---

# Security gateway — scan and fix

This app processes **money and customer data**. Before it goes live (and after
larger changes), run through this scan: **check → sort the findings by severity
→ fix → check again.** Wave nothing through.

If a security review tool is available in the environment (e.g.
`/security-review`), use it in addition. The checklist below is tailored to this
template.

## Checklist (check and fix)

### 1. Authentication & access control
- Protection is **opt-in**: only the paths in `proxy.ts`'s `matcher` are
  guarded, and `auth.config.ts` returns true for the rest. Check that every
  route added since the last audit is either in the matcher or genuinely
  public — a page absent from both lists is public by accident, not by design.
  Public are only the home page, `/login`, `/plans`, `/optin/*`
  and `/api/ipn`. Add new protected areas to the matcher.
- **IDOR:** does a server action/route only access data belonging to the
  signed-in user? Check every query for `where memberId = session.user.id` — `memberId` is the
  buyer column on every customer-owned table (`orders`, `grants`,
  `subscriptions`, `tokenAccounts`). `userId` exists only on the Auth.js
  `accounts`/`sessions` tables and is NOT an ownership column; grepping for it
  finds nothing and proves nothing
  (or an ownership check). Example pattern: `app/plans/actions.ts` re-checks
  `auth()` inside the server action — the button only rendering for a signed-in
  Member is cosmetics; a server action is an HTTP endpoint of its own.
- Protected content hangs exclusively on the entitlement API —
  `hasPlan(memberId, productKey)` from `lib/entitlements/manage.ts` — not on a
  guessable ID and not on a billing table. A hand-rolled query over `orders` or
  `subscriptions` is a finding, and not only a stylistic one: those tables
  answer a different question, and a cancelled subscription that still has paid
  time left reads as "blocked" there.
- No cached access booleans (a flag on the user row, a claim in the session).
  Entitlement is derived per request; a stored yes survives the chargeback that
  should have revoked it.

### 2. Digistore / payments
- The IPN **SHA512 signature verification** is active and **fail-closed**
  (`lib/digistore/ipn.ts`), and is bypassed nowhere. Invalid signature → 403.
- Idempotency via `ds24OrderId` (no double booking).
- **No mock/demo fallback** on API errors.

### 3. Secrets
- No API keys/passphrases/tokens in the code, in logs or in the client bundle.
  Never pass server-side values through to client components.
- The `.env` is **not** checked in (`.gitignore`), new variables go into `.env.example`.
- The operator's Digistore24 credentials live in the environment
  (`.env`, or the host's secret management) and are read via
  `lib/digistore/settings.ts` — not in the database and not in the code.
  There is deliberately **no** UI for entering keys; such an input field would
  be additional attack surface and must not be retrofitted.
- **Known exception, not a finding:** `BUILT_IN_DEVELOPER_KEY` in
  `scripts/ds24/connect-api-key.mjs`.
  A Digistore24 developer key carries no account permissions — it only
  identifies the application to `requestApiKey`, like an OAuth client ID. The
  key that carries permissions only comes into being when the merchant grants
  access. Do not remove it and do not obscure it; the scanner markers on that
  line are part of it.

### 4. Inputs & outputs
- Validate form/action inputs (required fields, types, limits; use `zod`).
- DB access via Drizzle (parameterized) — **no** string-built SQL.
- **XSS:** texts supplied by the user/buyer are rendered as text, **not**
  via `dangerouslySetInnerHTML`. Check every place where foreign content is rendered.
- Secure public endpoints (IPN, opt-in) against abuse (consider simple
  rate limiting/abuse protection).

### 5. Dependencies & configuration
- Run `npm audit`; fix high/critical vulnerabilities through updates.
- Current, patched framework versions (Next.js etc.).
- Consider security headers (e.g. via `next.config`/`proxy.ts`).

## Procedure

1. **Scan:** work through the checklist + the available security tool; note every
   deviation as a finding with a severity (critical/high/medium/low).
2. **Fix:** fix critical and high findings **now**. Keep fixes small and targeted.
3. **Verify:** check the affected flows again (e.g. invalid signature → 403,
   someone else's ID → no access), run the tests.
4. **Report:** short summary (what was found, what was fixed, what is open).

## STOP criteria (involve a human)
On suspicion of a data leak, a bypassed payment/signature check or access to
someone else's customer data: do not "paper over" it yourself, report it
(see `guardrails`).

Next step after a green security gateway: **`performance-gateway`**.
