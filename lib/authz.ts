// Rollen-basierte Zugriffskontrolle.
//
// Die Rolle steckt in der Session (siehe auth.config.ts → session.user.role).
// Konvention (db/schema.ts): "owner" = SAAS-Betreiber (Admin), "member" = Kunde.
//
// `middleware.ts` schützt nur "eingeloggt vs. nicht" — die *Rollen*-Prüfung
// passiert serverseitig in der jeweiligen Seite/Route über requireOwner().
//
// Die reinen Prädikate (isOwner/hasRole/roleLabel) stehen in lib/roles.ts und
// werden hier re-exportiert — sie sind damit auch aus Client-Komponenten
// importierbar, ohne dass der Bundler auth.ts (und den Mailversand) mitzieht.
// requireOwner lädt auth() erst zur Laufzeit (dynamischer Import); `redirect`
// bleibt statisch — next/navigation ist leichtgewichtig und liefert die
// `never`-Typverengung.
import { redirect } from "next/navigation";

// Rollen-Definitionen und -Prädikate liegen in lib/roles.ts (ohne Server-
// Abhängigkeiten, damit auch Client-Komponenten sie importieren können) und
// werden hier weitergereicht — Server-Code braucht so nur einen Import.
export { ROLES, isRole, roleLabel, isOwner, hasRole } from "./roles";
export type { Role } from "./roles";
import { isOwner } from "./roles";

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
