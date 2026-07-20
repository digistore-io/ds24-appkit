"use server";

// Server Actions der Benutzerverwaltung.
//
// SICHERHEIT — zwei Ebenen, absichtlich redundant:
//  1. requireOwner() als erste Zeile JEDER Action. Server Actions sind eigene
//     HTTP-Endpunkte; wer die Seite nicht sehen darf, könnte die Action sonst
//     trotzdem direkt aufrufen.
//  2. Die Regeln in lib/users/rules.ts (letzter Admin, Selbst-Löschung …),
//     geprüft in lib/users/manage.ts.
import { revalidatePath } from "next/cache";
import { requireOwner, isRole } from "@/lib/authz";
import { createUser, setUserRole, deleteUser } from "@/lib/users/manage";
import type { Actor } from "@/lib/users/rules";

const PAGE = "/dashboard/admin/users";

/** Rückgabewert für useActionState — null = alles gut, sonst die Fehlermeldung. */
export type ActionState = { error: string | null; ok: string | null };

async function actor(): Promise<Actor> {
  const session = await requireOwner();
  return { id: session.user.id as string, role: session.user.role as string };
}

/** Fehler aus der Regel-/DB-Schicht in eine anzeigbare Meldung übersetzen. */
function toState(e: unknown): ActionState {
  return {
    error: e instanceof Error ? e.message : "Unbekannter Fehler.",
    ok: null,
  };
}

export async function createUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const me = await actor();
    const role = String(formData.get("role") ?? "member");
    if (!isRole(role)) return { error: "Ungültige Rolle.", ok: null };
    const user = await createUser(me, {
      email: formData.get("email"),
      role,
      name: (formData.get("name") as string) || null,
    });
    revalidatePath(PAGE);
    return { error: null, ok: `${user.email} angelegt.` };
  } catch (e) {
    return toState(e);
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
    if (!isRole(role)) return { error: "Ungültige Rolle.", ok: null };
    await setUserRole(me, id, role);
    revalidatePath(PAGE);
    return { error: null, ok: "Rolle geändert." };
  } catch (e) {
    return toState(e);
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
    return { error: null, ok: "Benutzer gelöscht." };
  } catch (e) {
    return toState(e);
  }
}
