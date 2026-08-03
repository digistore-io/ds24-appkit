<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

## 3 · `flows` — every path, including the unhappy ones

Walk each one and ask at every screen: *what now?* A screen with no answer is a
dead end, and dead ends are where customers write to support.

The paths that exist in every app built on this template:

| Path | The screen that usually has nothing on it |
|---|---|
| Sign in for the first time | the dashboard before anything has been bought |
| Buy → return from checkout | `/dashboard` right after `/optin/[orderId]` |
| Buy a second plan / upgrade | a member holding two plans at once, briefly, or neither |
| A payment is missed | the plan simply vanishes from the page |
| The balance runs out mid-action | the refusal, with no way to top up on it |
| A refund | access ends, and nothing says why |
| Cancel a subscription | access runs on — does the app say that, or read as revoked? |

**The missed payment is the one to check by hand.** `hasPlan()` and
`entitlementsFor()` both stop reporting a suspended plan, so unless the page
uses `pausedKeys()` (`lib/entitlements/rules.ts`) the customer sees their plan
disappear with no explanation and reads it as an account closure. It is 🚨
CRITICAL when it is silent: they paid, and the app is telling them they did not.

For each dead end, name the screen and the sentence that is missing.

## 4 · `feedback` — does the app answer when spoken to

Three mechanisms, and between them they cover every case
(`CLAUDE.md` § **UI**, rule 1). What to check:

- **Every Server Action's result reaches a person.** Read each
  `app/**/actions.ts`, then find where its `state` is rendered. An action whose
  page never calls `useActionToast(state)` and never shows a `<Callout>` is
  silent on success AND on failure — ❌ HIGH.
- **Everything that ends in `redirect()` says so on the other side.** This is
  the one that goes missing, because it works for whoever wrote it.
- **A message never travels in the URL.** The parameter carries an id, the
  receiving page resolves it scoped to the session. A page rendering
  `searchParams.message` is 🚨 CRITICAL — anyone can hand somebody a link that
  makes your app say what they typed.
- **Everything destructive asks first**, through `<AlertDialog>`, naming what
  gets hit, with a red confirm button. A `confirm()` or a bare button is ❌ HIGH.
- **Nothing can be submitted twice.** `disabled={isPending}` on anything that
  charges, mails or bills. `spendTokens` is deliberately not idempotent.
- **Slow things say they are working.** A `<Skeleton>`, or a pending state on
  the button.
