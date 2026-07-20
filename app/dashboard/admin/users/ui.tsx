"use client";

// Client-Komponenten der Benutzerverwaltung.
//
// Die eigentliche Logik liegt in den Server Actions (actions.ts) — hier steht
// nur die Darstellung plus useActionState für Fehlermeldungen und den
// Lade-Zustand. Formulare funktionieren dadurch auch ohne JavaScript.
import { useActionState } from "react";
// Bewusst aus lib/roles (nicht lib/authz): authz hängt an auth.ts und damit am
// Mailversand — das gehört nicht ins Browser-Bundle.
import { roleLabel, type Role } from "@/lib/roles";
import {
  createUserAction,
  setRoleAction,
  deleteUserAction,
  type ActionState,
} from "./actions";

const EMPTY: ActionState = { error: null, ok: null };

function Meldung({ state }: { state: ActionState }) {
  if (state.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {state.error}
      </p>
    );
  if (state.ok)
    return <p className="text-sm text-muted-foreground">{state.ok}</p>;
  return null;
}

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUserAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="font-medium">Benutzer anlegen</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          E-Mail
          <input
            name="email"
            type="email"
            required
            placeholder="kunde@example.de"
            className="rounded-lg border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Name (optional)
          <input name="name" className="rounded-lg border px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Rolle
          <select name="role" defaultValue="member" className="rounded-lg border px-3 py-2">
            <option value="member">Nutzer</option>
            <option value="owner">Admin</option>
          </select>
        </label>
        <button
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          {pending ? "…" : "Anlegen"}
        </button>
      </div>
      <Meldung state={state} />
    </form>
  );
}

interface Row {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  createdAt: Date;
}

export function UserTable({
  users,
  currentUserId,
}: {
  users: Row[];
  currentUserId: string;
}) {
  const [roleState, roleAction] = useActionState(setRoleAction, EMPTY);
  const [delState, delAction] = useActionState(deleteUserAction, EMPTY);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left">
            <tr>
              <th className="p-3 font-medium">E-Mail</th>
              <th className="p-3 font-medium">Rolle</th>
              <th className="p-3 font-medium">Angelegt</th>
              <th className="p-3 font-medium">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === currentUserId;
              const nextRole: Role = u.role === "owner" ? "member" : "owner";
              return (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="p-3">
                    {u.email ?? "—"}
                    {u.name ? (
                      <span className="text-muted-foreground"> ({u.name})</span>
                    ) : null}
                    {isSelf ? (
                      <span className="text-muted-foreground"> — du</span>
                    ) : null}
                  </td>
                  <td className="p-3">{roleLabel(u.role)}</td>
                  <td className="p-3 text-muted-foreground">
                    {u.createdAt.toLocaleDateString("de-DE")}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      {/* Selbst-Degradierung und Selbst-Löschung sind serverseitig
                          verboten — hier blenden wir die Knöpfe zusätzlich aus. */}
                      {isSelf ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <>
                          <form action={roleAction}>
                            <input type="hidden" name="id" value={u.id} />
                            <input type="hidden" name="role" value={nextRole} />
                            <button className="rounded-lg border px-3 py-1">
                              zu {roleLabel(nextRole)} machen
                            </button>
                          </form>
                          <form action={delAction}>
                            <input type="hidden" name="id" value={u.id} />
                            <button className="rounded-lg border border-destructive px-3 py-1 text-destructive">
                              Löschen
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Meldung state={roleState} />
      <Meldung state={delState} />
    </div>
  );
}
