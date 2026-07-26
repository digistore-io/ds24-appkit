// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

"use server";

// Server actions for the Member's own MCP keys.
//
// The same two rules as `actions.ts` next door, and they matter more here
// because what is being handed out is a credential:
//
//  1. `requireActiveUser()` FIRST, on every action. A server action is an HTTP
//     endpoint of its own; the card only rendering for a signed-in Member
//     protects nothing.
//  2. **The account acted on is always the session's own.** No action takes a
//     member id from the form, and none may ever start doing so. `revokeKey`
//     additionally puts the member id in its WHERE clause, so a key id from a
//     tampered form matches nothing rather than somebody else's key.
//
// There is deliberately no Operator counterpart to any of this. An Operator who
// could mint a key for a customer could act as that customer — the same line
// `/dashboard/admin/users/[id]` already refuses to cross for passwords.
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireActiveUser } from "@/lib/authz";
import { isMcpEnabled } from "@/lib/mcp/config";
import { createKey, revokeKey } from "@/lib/mcp/keys";
import { McpError, checkKeyName, isLifetime, isScope } from "@/lib/mcp/rules";

const PAGE = "/dashboard/account";

/**
 * Like `ActionState`, plus the one thing that exists exactly once.
 *
 * `secret` is the new key in clear. It is returned here and nowhere else in
 * this app — the table holds a SHA-256, so after this response there is no
 * second chance to read it. The dialog says so before the Member closes it.
 */
export type McpActionState = {
  error: string | null;
  ok: string | null;
  secret?: string | null;
};

const EMPTY: McpActionState = { error: null, ok: null, secret: null };

async function toState(error: unknown): Promise<McpActionState> {
  // redirect() signals by THROWING — that is how requireActiveUser() sends a
  // signed-out or blocked visitor to /login. Swallowing it would turn a
  // legitimate redirect into "unknown error".
  unstable_rethrow(error);
  const t = await getTranslations("errors");
  if (error instanceof McpError) return { ...EMPTY, error: t(error.code) };

  console.error("[mcp] unexpected error:", error);
  return { ...EMPTY, error: t("unknown") };
}

/**
 * Issues a key and returns it once.
 *
 * The `isMcpEnabled()` check is here as well as in the route, and not by
 * accident: a key minted while the server is off is a live credential for an
 * endpoint that answers 404 — the Member would be looking at a key that cannot
 * work and has no way to tell why.
 */
export async function createKeyAction(
  _prev: McpActionState,
  formData: FormData,
): Promise<McpActionState> {
  try {
    const session = await requireActiveUser();
    if (!isMcpEnabled()) throw new McpError("mcpDisabled");

    const checked = checkKeyName(formData.get("name"));
    if (!checked.ok) throw new McpError(checked.code);

    // Both come from a <select>, and neither is trusted because of that. An
    // unrecognised value falls back to the SAFER option — `read`, and an
    // expiry rather than none — instead of throwing: the failure mode of a
    // fallback here is a key that does less than the Member wanted, which they
    // can see and redo.
    const rawScope = formData.get("scope");
    const scope = isScope(rawScope) ? rawScope : "read";

    const rawDays = formData.get("lifetimeDays");
    const parsed = rawDays === "never" ? null : Number(rawDays);
    const lifetimeDays = isLifetime(parsed) ? parsed : 90;

    const created = await createKey({
      memberId: session.user.id as string,
      name: checked.name,
      scope,
      lifetimeDays,
    });

    revalidatePath(PAGE);
    const t = await getTranslations("mcp");
    return {
      error: null,
      ok: t("createdToast", { name: created.name }),
      secret: created.secret,
    };
  } catch (error) {
    return toState(error);
  }
}

/**
 * Revokes a key. Immediate — the next call with it is refused.
 *
 * Idempotent on purpose: revoking an already-revoked key reports success. A red
 * message about a key that is, in fact, revoked would send somebody looking for
 * a problem that does not exist.
 */
export async function revokeKeyAction(
  _prev: McpActionState,
  formData: FormData,
): Promise<McpActionState> {
  try {
    const session = await requireActiveUser();

    await revokeKey({
      memberId: session.user.id as string,
      keyId: String(formData.get("keyId") ?? ""),
    });

    revalidatePath(PAGE);
    const t = await getTranslations("mcp");
    return { ...EMPTY, ok: t("revokedToast") };
  } catch (error) {
    return toState(error);
  }
}
