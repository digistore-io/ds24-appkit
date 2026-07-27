// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The first five minutes of a new customer, as a rule instead of a feeling.
//
// PURE — no database, no I/O, no React. The page loads the state and hands the
// answers in; this file decides what to show. Same split, and same reason, as
// lib/entitlements/rules.ts: there is no test database in this project, so a
// rule that lives inside a `&&` in a page component is a rule nothing asserts.
//
// ── THE ONE DECISION THAT SHAPES EVERYTHING ELSE ─────────────────────────────
//
//   A STEP IS DONE BECAUSE THE STATE SAYS SO — NEVER BECAUSE SOMEBODY TICKED IT.
//
// There is no `onboarding_steps` table, no `dismissedAt` column and no cookie,
// and none of them is missing. A stored tick is a second copy of a truth the
// database already holds, and the copy is the one that goes wrong: the customer
// who buys a plan through a second device, the one whose refund takes the plan
// away again, the operator who grants access by hand — all three end up with a
// checklist that disagrees with the app. Deriving it costs one boolean per step
// at render time and cannot drift by construction.
//
// The two consequences are worth knowing before somebody "fixes" them:
//
//   - There is no dismiss button, and there must not be one. A step that is not
//     done is a thing the customer has not got to yet; hiding it hides the only
//     place the app says so. The card leaves by being finished.
//   - A step that goes back to undone (a refund, an expired plan) brings the
//     card back. That is correct — the customer's access really did change —
//     and it is the case a stored tick would silently get wrong.
//
// The steps themselves belong to the APP, not to this file. The blueprint is
// app/dashboard/page.tsx; docs/ux.md says how to replace them.

/**
 * One step, reduced to what the rules below read. The text lives at the call
 * site (both language files), because it is the app's own wording — see
 * components/onboarding-checklist.tsx for the view type that carries it.
 */
export interface OnboardingStep {
  /** Stable, for React keys and for tests. Never shown to anybody. */
  id: string;
  /** Derived from real state at render time. See the header. */
  done: boolean;
}

/** How far along the customer is. `total` is never assumed to be non-zero. */
export interface OnboardingProgress {
  done: number;
  total: number;
  /** 0–100, rounded. `0` for an empty list — see `progress()`. */
  percent: number;
}

export function progress(steps: readonly OnboardingStep[]): OnboardingProgress {
  const total = steps.length;
  const done = steps.filter((s) => s.done).length;
  // Guard the division rather than the caller: an app mid-rebuild can easily
  // hand in an empty list, and NaN reaches the DOM as `width: NaN%`, which
  // renders as a full bar in some browsers and none in others.
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, percent };
}

/** Every step done — and at least one step to be done. */
export function allDone(steps: readonly OnboardingStep[]): boolean {
  return steps.length > 0 && steps.every((s) => s.done);
}

/**
 * The one step to point at, or `null` when there is none.
 *
 * The FIRST open one in the given order, and open steps after it stay open.
 * Deliberately not "the last one before the first gap": these steps are not a
 * sequence, they are a set — somebody can buy tokens before they ever look at
 * their account — so a later tick must not imply the earlier ones.
 */
export function nextStep(
  steps: readonly OnboardingStep[],
): OnboardingStep | null {
  return steps.find((s) => !s.done) ?? null;
}

/**
 * Should the card render at all?
 *
 * Two `false` cases, and they are different things:
 *
 *   - **No steps.** The app has not declared any. Rendering "0 of 0 done" is
 *     an empty promise on the most important page in the app.
 *   - **All done.** The card has said everything it has to say, and it leaves.
 *     That absence IS the acknowledgement — the customer who has just bought
 *     sees the checklist go, which no message that expires can do.
 */
export function shouldShowChecklist(steps: readonly OnboardingStep[]): boolean {
  return steps.length > 0 && !allDone(steps);
}
