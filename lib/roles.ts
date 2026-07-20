// Rollen — reine Definitionen, OHNE Server-Abhängigkeiten.
//
// Warum eine eigene Datei: `lib/authz.ts` hängt an `auth.ts` (und darüber am
// Mailversand). Würde eine Client-Komponente von dort importieren, zöge der
// Bundler serverseitige Module ins Browser-Bundle und der Build bricht.
// Alles, was auch im Browser gebraucht wird, gehört deshalb hierher.
//
// lib/authz.ts re-exportiert diese Helfer, damit Server-Code weiterhin nur
// einen Import braucht.

/**
 * Die kanonischen Rollen. Bewusst nur zwei:
 *   "owner"  = Betreiber/Admin — darf alles, inkl. Benutzerverwaltung
 *   "member" = normaler Nutzer/Kunde — Default beim Selbst-Login
 *
 * In der Oberfläche heißen sie „Admin" und „Nutzer" (siehe roleLabel).
 * Die CLI akzeptiert zusätzlich die Aliase admin→owner und user→member
 * (scripts/users/_db.mjs).
 */
export const ROLES = ["owner", "member"] as const;
export type Role = (typeof ROLES)[number];

/** Prüft, ob ein beliebiger Wert eine gültige Rolle ist (z. B. Formular-Eingabe). */
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Anzeigename einer Rolle für die Oberfläche. */
export function roleLabel(role: string): string {
  return role === "owner" ? "Admin" : role === "member" ? "Nutzer" : role;
}

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
