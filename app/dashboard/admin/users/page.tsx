import Link from "next/link";
import { requireOwner, roleLabel } from "@/lib/authz";
import { listUsers } from "@/lib/users/manage";
import { UserTable, CreateUserForm } from "./ui";

// Benutzerverwaltung — nur für Admins (requireOwner als erste Zeile).
//
// Diese Seite gehört zum Grundgerüst: Sie funktioniert sofort und zeigt, wie
// eine geschützte Admin-Funktion aussieht. Du kannst sie erweitern (Suche,
// Einladungen, Sperren) oder ganz entfernen, wenn deine App sie nicht braucht.
export default async function AdminUsersPage() {
  const session = await requireOwner();
  const users = await listUsers();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Benutzer</h1>
        <Link
          href="/dashboard/admin"
          className="text-sm text-muted-foreground underline"
        >
          ← Admin
        </Link>
      </div>

      <p className="text-muted-foreground">
        {users.length} {users.length === 1 ? "Benutzer" : "Benutzer"} · du bist
        angemeldet als {session.user.email} ({roleLabel(session.user.role ?? "")}
        ).
      </p>

      <CreateUserForm />

      <UserTable users={users} currentUserId={session.user.id as string} />

      <p className="text-sm text-muted-foreground">
        Neu angelegte Benutzer melden sich selbst per Magic-Link unter{" "}
        <code>/login</code> an — ein Passwort gibt es nicht. Dasselbe geht im
        Terminal mit <code>make user-create</code>.
      </p>
    </main>
  );
}
