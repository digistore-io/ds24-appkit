// Rollen-basierte Zugriffskontrolle.
//
// Die Rolle steckt in der Session (siehe auth.config.ts → session.user.role).
// Konvention (db/schema.ts): "owner" = SAAS-Betreiber (Admin), "member" = Kunde.
//
// `middleware.ts` schützt nur "eingeloggt vs. nicht" — die *Rollen*-Prüfung
// passiert serverseitig in der jeweiligen Seite/Route über requireOwner().
//
// Die reinen Prädikate (isOwner/hasRole) sind bewusst frei vom schweren
// Auth-Import, damit sie ohne Server-Runtime testbar sind; requireOwner lädt
// auth() erst zur Laufzeit (dynamischer Import). `redirect` bleibt statisch —
// next/navigation ist leichtgewichtig und liefert die `never`-Typverengung.
import { redirect } from "next/navigation";

/** true, wenn die Rolle Betreiber-/Admin-Rechte hat. */
export function isOwner(role?: string | null): boolean {
  return role === "owner";
}

/** true, wenn die Rolle in der erlaubten Liste ist. */
export function hasRole(
  role: string | null | undefined,
  allowed: readonly string[],
): boolean {
  return role != null && allowed.includes(role);
}

/**
 * Guard für Betreiber-/Admin-Bereiche.
 * - kein Login  → Redirect nach /login
 * - kein owner  → Redirect nach /dashboard
 * Gibt die Session zurück, wenn die Rolle passt.
 *
 * Optional könnte man /-Präfixe zusätzlich in auth.config.ts:authorized() gaten;
 * hier bewusst serverseitig, damit die Rolle aus der DB frisch geprüft wird.
 */
export async function requireOwner() {
  const { auth } = await import("@/auth");
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isOwner(session.user.role)) redirect("/dashboard");
  return session;
}
