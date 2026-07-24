"use server";

import { unstable_rethrow } from "next/navigation";

// Server actions of the Member's own account page.
//
// SECURITY — the difference from the admin actions next door is worth stating,
// because it is easy to copy the wrong shape:
//
//  1. `requireActiveUser()` rather than `requireOwner()`. These belong to every
//     signed-in Member, not to the Operator. It still runs FIRST on every
//     action — a server action is an HTTP endpoint of its own, and the page
//     having guarded itself protects nothing here.
//  2. **The account acted on is always the session's own.** No action takes a
//     user id from the form, and none may ever start doing so. That is what
//     makes an IDOR impossible rather than merely unlikely: there is no
//     parameter to tamper with.
//
// THIS FILE SENDS MAIL, and the neighbouring admin actions must not — the
// difference is the point, not an inconsistency. lib/entitlements/leak-guard.test.ts
// forbids the mailer in `admin/users/[id]/actions.ts` because a balance
// correction is something an OPERATOR did to a customer, and a mail about it
// would explain a change the customer never asked about. A credential change is
// something done to the MEMBER'S OWN way in, and the whole reason to send it is
// the case where the Member did not do it.
//
// LANGUAGE: here — and only here — the codes from lib/credentials/rules.ts
// become sentences, in the language of the Member currently clicking.
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { requireActiveUser } from "@/lib/authz";
import { setPassword, removePassword } from "@/lib/credentials/manage";
import { CredentialError } from "@/lib/credentials/rules";
import type { CredentialChange } from "@/lib/email";

const PAGE = "/dashboard/account";

/**
 * Tells the Member their credentials moved — and NEVER lets that failure undo
 * the change itself.
 *
 * The order is deliberate: the password is already written when this runs. If
 * the notice cannot go out — no transport configured locally, provider down,
 * mailbox full — the Member has still changed their password, and telling them
 * otherwise would be a lie that also loses the change. So this swallows
 * everything and leaves a log line instead.
 *
 * The mail is loaded at runtime: `lib/email` reaches for `nodemailer`, and a
 * static import here would drag it into this module's graph for the sake of a
 * path that most installations never take.
 */
async function notify(
  email: string | null,
  change: CredentialChange,
): Promise<void> {
  if (!email) return;
  try {
    const { sendCredentialChangeEmail, isEmailLoginEnabled } = await import(
      "@/lib/email"
    );
    // No transport (a DEV machine before `node run.mjs mail-setup`) is a normal
    // state here, not an error — do not log it as one.
    if (!isEmailLoginEnabled()) return;
    await sendCredentialChangeEmail(email, change, new Date());
  } catch (error) {
    console.error(
      `[account] credential notice to ${email} (${change}) could not be sent:`,
      error,
    );
  }
}

/** Return value for useActionState — `error`/`ok` are finished messages. */
export type ActionState = { error: string | null; ok: string | null };

/** Turn an error from the rules/database layer into a displayable message. */
async function toState(error: unknown): Promise<ActionState> {
  // redirect() signals by THROWING — that is how requireActiveUser() sends a
  // signed-out or blocked visitor to /login. Swallowing it would turn a
  // legitimate redirect into "unknown error".
  unstable_rethrow(error);
  const t = await getTranslations("errors");
  if (error instanceof CredentialError) return { error: t(error.code), ok: null };

  console.error("[account] unexpected error:", error);
  return { error: t("unknown"), ok: null };
}

/**
 * Sets a first password, or replaces an existing one.
 *
 * Which of the two it is comes from the database, never from the form: a form
 * that claimed "no password yet" would otherwise be a way to skip proving the
 * current one.
 */
export async function setPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireActiveUser();
    const { email, created } = await setPassword(session.user.id as string, {
      password: String(formData.get("password") ?? ""),
      confirmation: String(formData.get("confirmation") ?? ""),
      current: String(formData.get("current") ?? ""),
    });
    await notify(email, created ? "passwordSet" : "passwordChanged");
    revalidatePath(PAGE);
    const t = await getTranslations("account");
    return { error: null, ok: t("passwordSaved") };
  } catch (error) {
    return toState(error);
  }
}

/**
 * Removes the password. Magic-link sign-in is untouched, so the account never
 * ends up without a way in — which is the whole reason this is safe to offer
 * as a plain toggle rather than as a dangerous operation.
 */
export async function removePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireActiveUser();
    const { email } = await removePassword(session.user.id as string, {
      current: String(formData.get("current") ?? ""),
    });
    await notify(email, "passwordRemoved");
    revalidatePath(PAGE);
    const t = await getTranslations("account");
    return { error: null, ok: t("passwordRemoved") };
  } catch (error) {
    return toState(error);
  }
}
