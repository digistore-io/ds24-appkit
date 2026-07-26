// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

"use server";

// Stepping back out of a customer's account.
//
// It lives at the root of `app/` rather than under `app/dashboard/admin/users/`
// with its sibling, and that is deliberate: the banner carrying this button is
// on EVERY page — the dashboard, the account pages, the public home page,
// `/plans`, `/login` — so the action cannot belong to one route's folder.
//
// ══════════════════════════════════════════════════════════════════════════
// THIS ACTION DOES NOT CALL requireOwner(), AND IT MUST NOT
// ══════════════════════════════════════════════════════════════════════════
// Every other admin action in this app opens with `requireOwner()`, because a
// Server Action is an HTTP endpoint of its own. This one is the exception, and
// on inspection it will look like the exception was an oversight.
//
// It is not. While an impersonation is running, the session's role IS the
// member's — that is the whole design (AD-23), and it is what makes every
// existing `requireOwner()` in the app refuse without a single guard being
// modified, including on pages nobody has written yet. An owner check *here*
// would therefore refuse the one action that gets the Operator out again, and
// the session would have no exit at all.
//
// What guards it instead is `canStopImpersonating()`: an impersonation has to
// be running. And it takes no id, no target and no form field — the session it
// ends is always the caller's own, the same guarantee `spendTokens()` gives.
// There is nothing here for one member to point at another.
// ══════════════════════════════════════════════════════════════════════════
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

/** Return value for useActionState — a finished message, or nothing. */
export type ImpersonationActionState = { error: string | null };

export async function stopImpersonationAction(): Promise<ImpersonationActionState> {
  const { auth, unstable_update } = await import("@/auth");
  const session = await auth();

  const { canStopImpersonating } = await import("@/lib/users/rules");
  // `impersonation` is only ever set while one is running and inside its cap
  // (auth.config.ts). An expired one presents the Operator again and has
  // nothing left to stop — the record is closed by the scheduled job.
  const denial = canStopImpersonating({
    alreadyImpersonating: Boolean(session?.user?.impersonation),
  });

  if (denial) {
    const { getTranslations } = await import("next-intl/server");
    const t = await getTranslations("errors");
    return { error: t(denial) };
  }

  // Returns null when the Operator no longer has anywhere to go back to —
  // demoted, blocked or deleted while they were inside. The session is
  // destroyed rather than restoring rights that no longer exist.
  const restored = await unstable_update({
    impersonation: { stop: true },
  } as Parameters<typeof unstable_update>[0]);

  revalidatePath("/", "layout");

  if (!restored) redirect("/login");
  redirect("/dashboard/admin/users");
}

/**
 * Clean up after an impersonation that ran out of time.
 *
 * ── Why this exists at all ─────────────────────────────────────────────────
 * When the thirty minutes pass, every reader already treats the session as the
 * Operator's again (auth.config.ts) — but the CLAIM is still sitting in the
 * token, because Next.js forbids setting a cookie during a server-component
 * render, so no page load can rewrite it. Left alone, the leftover would make
 * the app announce "your session ended" on every page for the rest of the
 * sign-in, and the record row would wait for the scheduled job.
 *
 * So the banner fires this once from the client, where an action CAN write a
 * cookie. It closes the record as `expired`, strips the claim, and — unlike
 * `stopImpersonationAction` — sends nobody anywhere. The Operator did not press
 * anything; being thrown to another page because a timer went off would be its
 * own small betrayal.
 *
 * Safe to call when there is nothing to clean up: the callback returns the
 * token untouched.
 */
export async function clearEndedImpersonationAction(): Promise<void> {
  const { unstable_update } = await import("@/auth");
  await unstable_update({
    impersonation: { stop: true },
  } as Parameters<typeof unstable_update>[0]);
  revalidatePath("/", "layout");
}
