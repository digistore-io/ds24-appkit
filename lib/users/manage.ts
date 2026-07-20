// Benutzerverwaltung — Datenbank-Schicht.
//
// Jede schreibende Funktion prüft ZUERST die Regeln aus ./rules.ts und wirft
// bei Ablehnung. Die Server Actions (app/dashboard/admin/users/actions.ts)
// fangen das ab und zeigen die Meldung an.
//
// Achtung: Diese Funktionen setzen NICHT voraus, dass der Aufrufer berechtigt
// ist — sie prüfen es selbst anhand des übergebenen Actors. Trotzdem gilt in
// den Actions zusätzlich requireOwner() (doppelter Boden).
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, count, asc } from "drizzle-orm";
import type { Role } from "@/lib/authz";
import {
  canCreateUser,
  canChangeRole,
  canDeleteUser,
  normalizeEmail,
  type Actor,
} from "./rules";

export interface UserRow {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  createdAt: Date;
}

/** Alle Benutzer, älteste zuerst. */
export async function listUsers(): Promise<UserRow[]> {
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.createdAt));
}

/** Anzahl der Admins — Grundlage für die „letzter Admin"-Regel. */
export async function countOwners(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(eq(users.role, "owner"));
  return Number(row?.n ?? 0);
}

async function requireUser(id: string): Promise<UserRow> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id));
  if (!row) throw new Error("Benutzer nicht gefunden.");
  return row;
}

/**
 * Legt einen Benutzer an (oder aktualisiert die Rolle, falls die E-Mail schon
 * existiert). Der Benutzer meldet sich danach ganz normal per Magic-Link an.
 */
export async function createUser(
  actor: Actor,
  input: { email: unknown; role: Role; name?: string | null },
): Promise<UserRow> {
  const denial = canCreateUser(actor);
  if (denial) throw new Error(denial);

  const email = normalizeEmail(input.email);
  if (!email) throw new Error("Bitte eine gültige E-Mail-Adresse angeben.");

  const [row] = await db
    .insert(users)
    .values({ email, role: input.role, name: input.name ?? null })
    .onConflictDoUpdate({
      target: users.email,
      set: { role: input.role },
    })
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      createdAt: users.createdAt,
    });
  return row;
}

/** Setzt die Rolle eines Benutzers. */
export async function setUserRole(
  actor: Actor,
  targetId: string,
  newRole: Role,
): Promise<void> {
  const target = await requireUser(targetId);
  const denial = canChangeRole(actor, target, newRole, await countOwners());
  if (denial) throw new Error(denial);
  if (target.role === newRole) return;
  await db.update(users).set({ role: newRole }).where(eq(users.id, targetId));
}

/**
 * Löscht einen Benutzer. Sessions/Accounts hängen per ON DELETE CASCADE daran
 * (siehe db/schema.ts) und verschwinden mit.
 */
export async function deleteUser(actor: Actor, targetId: string): Promise<void> {
  const target = await requireUser(targetId);
  const denial = canDeleteUser(actor, target, await countOwners());
  if (denial) throw new Error(denial);
  await db.delete(users).where(eq(users.id, targetId));
}
