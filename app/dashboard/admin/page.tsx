import Link from "next/link";
import { requireOwner } from "@/lib/authz";

// Betreiber-/Admin-Bereich — nur für Rolle "owner" (siehe lib/authz.ts).
// Vorbild für eigene Admin-Seiten: requireOwner() als erste Zeile genügt.
export default async function AdminPage() {
  const session = await requireOwner();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <Link href="/dashboard" className="text-sm text-muted-foreground underline">
          ← Dashboard
        </Link>
      </div>

      <p className="text-muted-foreground">
        Betreiber-Bereich. Angemeldet als {session.user.email} (Rolle:{" "}
        {session.user.role}).
      </p>

      <div className="rounded-lg border p-4">
        <h2 className="font-medium">Nur für Betreiber</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Diese Seite ist über <code>requireOwner()</code> abgesichert. Weitere
          Admin-Funktionen hier ergänzen. Weitere owner-Accounts anlegen per{" "}
          <code>make user-create ARGS=&quot;--email … --role owner --apply&quot;</code>.
        </p>
      </div>
    </main>
  );
}
