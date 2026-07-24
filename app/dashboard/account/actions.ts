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
// NO MAILER, and no `signIn` import. lib/entitlements/leak-guard.test.ts guards
// the admin actions for the same reason; this file stays clean by the same
// argument, so that credential changes cannot quietly grow a mail path without
// somebody deciding to add one.
//
// LANGUAGE: here — and only here — the codes from lib/credentials/rules.ts
// become sentences, in the language of the Member currently clicking.
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { requireActiveUser } from "@/lib/authz";
import { setPassword, removePassword } from "@/lib/credentials/manage";
import { CredentialError } from "@/lib/credentials/rules";

const PAGE = "/dashboard/account";

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
    await setPassword(session.user.id as string, {
      password: String(formData.get("password") ?? ""),
      confirmation: String(formData.get("confirmation") ?? ""),
      current: String(formData.get("current") ?? ""),
    });
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
    await removePassword(session.user.id as string, {
      current: String(formData.get("current") ?? ""),
    });
    revalidatePath(PAGE);
    const t = await getTranslations("account");
    return { error: null, ok: t("passwordRemoved") };
  } catch (error) {
    return toState(error);
  }
}
