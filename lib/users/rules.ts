// Regeln der Benutzerverwaltung — bewusst als REINE Funktionen, ohne Datenbank.
//
// Warum getrennt: Diese Regeln verhindern, dass sich ein Betreiber selbst
// aussperrt oder die App ohne Admin zurückbleibt. Sie sind damit
// sicherheitsrelevant und müssen einzeln testbar sein (lib/users/rules.test.ts).
//
// Die Datenbank-Schicht (lib/users/manage.ts) ruft sie auf, BEVOR sie schreibt.
import type { Role } from "@/lib/authz";

/** Der handelnde Admin. */
export interface Actor {
  id: string;
  role: string;
}

/** Der betroffene Benutzer. */
export interface Target {
  id: string;
  role: string;
}

/**
 * Ergebnis einer Prüfung. `null` = erlaubt; sonst der Grund für die Ablehnung
 * (direkt für den Nutzer anzeigbar).
 */
export type Denial = string | null;

/**
 * Darf `actor` den Benutzer `target` löschen?
 *
 * Verboten ist:
 *  - kein Admin zu sein,
 *  - sich selbst zu löschen (man würde sich aussperren),
 *  - den letzten verbleibenden Admin zu löschen (niemand käme mehr rein).
 */
export function canDeleteUser(
  actor: Actor,
  target: Target,
  ownerCount: number,
): Denial {
  if (actor.role !== "owner") return "Nur Admins dürfen Benutzer löschen.";
  if (actor.id === target.id)
    return "Du kannst dich nicht selbst löschen. Lass dich von einem anderen Admin entfernen.";
  if (target.role === "owner" && ownerCount <= 1)
    return "Das ist der letzte Admin — er kann nicht gelöscht werden.";
  return null;
}

/**
 * Darf `actor` die Rolle von `target` auf `newRole` setzen?
 *
 * Verboten ist:
 *  - kein Admin zu sein,
 *  - sich selbst zu degradieren (man verlöre sofort den Zugang),
 *  - den letzten Admin zum Nutzer zu machen.
 *
 * Erlaubt (und absichtlich folgenlos) ist das Setzen der Rolle, die schon gilt.
 */
export function canChangeRole(
  actor: Actor,
  target: Target,
  newRole: Role,
  ownerCount: number,
): Denial {
  if (actor.role !== "owner") return "Nur Admins dürfen Rollen ändern.";
  if (target.role === newRole) return null;
  if (actor.id === target.id && newRole !== "owner")
    return "Du kannst dir nicht selbst die Admin-Rechte entziehen.";
  if (target.role === "owner" && newRole !== "owner" && ownerCount <= 1)
    return "Das ist der letzte Admin — seine Rolle kann nicht geändert werden.";
  return null;
}

/** Darf `actor` überhaupt Benutzer anlegen? */
export function canCreateUser(actor: Actor): Denial {
  if (actor.role !== "owner") return "Nur Admins dürfen Benutzer anlegen.";
  return null;
}

/**
 * Normalisiert und prüft eine E-Mail-Eingabe.
 * @returns die getrimmte Kleinbuchstaben-Adresse oder null, wenn sie unbrauchbar ist.
 */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  // Bewusst simpel: ein Zeichen vor und nach dem @, ein Punkt in der Domain.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
