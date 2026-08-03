<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

## 2 · `first-run` — the first five minutes

**Do this as the customer, in order, and write down what you did not
understand.** Not what you would improve — what you did not understand. The
second list is short and it is the one worth acting on.

The walk:

1. Land on `/` as a stranger. What is this, who is it for, what does it cost?
2. Go to `/plans`. Is it clear what each plan gives you?
3. Buy one (test purchase — `setup-digistore` explains the cookie), land back
   through `/optin/[orderId]`.
4. **Stop on `/dashboard` and look at it as somebody who has just paid.** Does
   anything on this page confirm the purchase? Does anything say what to do
   next? Now **reload it** — is that still true?
5. Do the thing the app is for. Count the clicks and the guesses.

What to look for, and what the template already gives you:

| Question | Where the answer lives |
|---|---|
| Does the app say what to do first? | `<OnboardingChecklist>` on `app/dashboard/page.tsx` — steps derived from real state, `lib/onboarding/rules.ts` |
| Do the steps mean anything for THIS app? | the two shipped steps (buy a plan, top up) are a **blueprint** and are meant to be replaced |
| What should the steps say instead? | [`docs/onboarding.md`](../../../../docs/onboarding.md) — the activation event, and 3–5 milestones toward it |
| Does the purchase survive a reload? | it has to be visible in the app's state, not only in the toast (`docs/ux.md` §2) |
| Is every empty list explained? | `<EmptyState>` with a sentence and, where there is one, a button |

**The finding that is almost always there on a young app:** the checklist still
holds the two shipped steps, so the app's only advice to a new customer is "buy
something" — while the thing they bought sits behind a menu entry nobody
mentioned. That is ❌ HIGH, and the fix is three lines in
`app/dashboard/page.tsx`. *Choosing* what the steps should be — the activation
event, and whether this app wants a survey or a nudge around them — is the
skill **`user-onboarding`**; report the finding here and hand over there when
the user wants it built.
