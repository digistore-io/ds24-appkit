import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { Callout } from "@/components/ui/callout";

// Geschützter Bereich (via middleware.ts). Startpunkt deiner App.
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Die Digistore24-Verbindung ist Sache der Installation, nicht des Benutzers:
  // sie kommt aus der .env (make ds24-connect), nicht aus einem Formular.
  const verbunden = Boolean(process.env.DIGISTORE_API_KEY);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button className="rounded-lg border px-3 py-1 text-sm">Abmelden</button>
        </form>
      </div>

      <p className="text-muted-foreground">
        Angemeldet als {session.user.email}.
      </p>

      {!verbunden && (
        <Callout variant="warning" title="Digistore24 ist noch nicht verbunden">
          Die Verbindung wird im Terminal hergestellt, nicht hier — so landet der
          Schlüssel direkt in deiner <code>.env</code> und nie in der Datenbank
          oder im Browser:
          <pre className="mt-2 overflow-x-auto rounded-md border bg-background p-2 text-xs">
            make ds24-connect
          </pre>
        </Callout>
      )}
    </main>
  );
}
