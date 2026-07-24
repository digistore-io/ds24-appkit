"use server";

import { unstable_rethrow } from "next/navigation";

// Server actions of the user management screen.
//
// SECURITY — two layers, deliberately redundant:
//  1. requireOwner() as the first line of EVERY action. Server actions are
//     HTTP endpoints of their own; without this, someone who may not see the
//     page could still call the action directly.
//  2. The rules in lib/users/rules.ts (last admin, self-deletion, …), checked
//     in lib/users/manage.ts.
//
// LANGUAGE: here — and only here — the error codes from the rules layer become
// sentences. The language is that of the running request, i.e. of the admin
// currently clicking.
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireOwner, isRole } from "@/lib/authz";
import {
  createUser,
  setUserRole,
  setUserBlocked,
  setUserEmail,
  loginLinkTarget,
  deleteUser,
} from "@/lib/users/manage";
import { UserError, type Actor } from "@/lib/users/rules";

const PAGE = "/dashboard/admin/users";

/** Return value for useActionState — `error`/`ok` are finished messages. */
export type ActionState = { error: string | null; ok: string | null };

async function actor(): Promise<Actor> {
  const session = await requireOwner();
  return { id: session.user.id as string, role: session.user.role as string };
}

/** Turn an error from the rules/database layer into a displayable message. */
async function toState(error: unknown): Promise<ActionState> {
  // redirect() and notFound() signal by THROWING — that is how requireOwner()
  // turns "not an admin" into a redirect. Swallowing them logs a fake
  // "unexpected error" on every legitimate refusal and answers the caller
  // "unknown error" where the framework meant to send them somewhere.
  //
  // unstable_rethrow knows the current digests. Matching them by hand does not
  // survive a Next upgrade: this project is on 15.5.20, where the old
  // NEXT_NOT_FOUND is already gone in favour of NEXT_HTTP_ERROR_FALLBACK.
  unstable_rethrow(error);
  const t = await getTranslations("errors");
  if (error instanceof UserError) return { error: t(error.code), ok: null };

  // Anything unexpected (database gone, network, programming mistake) ends up
  // here. All we tell the admin is "unknown error" — the reason belongs in the
  // log, not in the UI, where it would likely give away internals.
  console.error("[users] unexpected error:", error);
  return { error: t("unknown"), ok: null };
}

export async function createUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const me = await actor();
    const role = String(formData.get("role") ?? "member");
    if (!isRole(role)) {
      const t = await getTranslations("errors");
      return { error: t("invalidRole"), ok: null };
    }
    const user = await createUser(me, {
      email: formData.get("email"),
      role,
      name: (formData.get("name") as string) || null,
    });
    revalidatePath(PAGE);
    const t = await getTranslations("users");
    return { error: null, ok: t("created", { email: user.email ?? "" }) };
  } catch (error) {
    return toState(error);
  }
}

export async function setRoleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const me = await actor();
    const id = String(formData.get("id") ?? "");
    const role = String(formData.get("role") ?? "");
    if (!isRole(role)) {
      const t = await getTranslations("errors");
      return { error: t("invalidRole"), ok: null };
    }
    await setUserRole(me, id, role);
    revalidatePath(PAGE);
    const t = await getTranslations("users");
    return { error: null, ok: t("roleChanged") };
  } catch (error) {
    return toState(error);
  }
}

export async function setBlockedAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const me = await actor();
    // The desired state comes from the form rather than being a "toggle": two
    // admins clicking the same row at the same time would otherwise cancel
    // each other out. This way the most recently expressed wish wins.
    const blocked = formData.get("blocked") === "true";
    await setUserBlocked(me, String(formData.get("id") ?? ""), blocked);
    revalidatePath(PAGE);
    const t = await getTranslations("users");
    return { error: null, ok: t(blocked ? "blocked" : "unblocked") };
  } catch (error) {
    return toState(error);
  }
}

export async function setEmailAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const me = await actor();
    const email = await setUserEmail(
      me,
      String(formData.get("id") ?? ""),
      formData.get("email"),
    );
    revalidatePath(PAGE);
    const t = await getTranslations("users");
    return { error: null, ok: t("emailChanged", { email }) };
  } catch (error) {
    return toState(error);
  }
}

/**
 * Sends the user a sign-in link.
 *
 * This app has no passwords — you sign in with a magic link (see
 * lib/email.ts). There is therefore no "reset password" here; this link is its
 * counterpart.
 *
 * Delivery deliberately goes through Auth.js's signIn() rather than a
 * hand-rolled token: only that way is it THE SAME mechanism as a normal
 * sign-in — same lifetime, same storage, same redemption. A second,
 * hand-written token path would be a second place where authentication can go
 * wrong.
 */
export async function sendLoginLinkAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const me = await actor();

    const { isEmailLoginEnabled } = await import("@/lib/email");
    if (!isEmailLoginEnabled()) throw new UserError("emailNotConfigured");

    const email = await loginLinkTarget(me, String(formData.get("id") ?? ""));

    const { signIn } = await import("@/auth");
    // `redirect: false` is essential here: a redirect would throw the admin
    // who just clicked off their own page. They should stay where they are and
    // only see a confirmation.
    await signIn("email", { email, redirect: false });

    const t = await getTranslations("users");
    return { error: null, ok: t("linkSent", { email }) };
  } catch (error) {
    return toState(error);
  }
}

export async function deleteUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const me = await actor();
    await deleteUser(me, String(formData.get("id") ?? ""));
    revalidatePath(PAGE);
    const t = await getTranslations("users");
    return { error: null, ok: t("deleted") };
  } catch (error) {
    return toState(error);
  }
}
