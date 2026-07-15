import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

// Geschützter Bereich (via middleware.ts). Startpunkt deiner App.
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

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

      <div className="rounded-lg border p-4">
        <h2 className="font-medium">Digistore24 einrichten</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Hinterlege deinen API-Key und die IPN-Passphrase, um Verkäufe zu empfangen.
        </p>
        <Link
          href="/onboarding/digistore"
          className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-primary-foreground"
        >
          Zum Onboarding
        </Link>
      </div>
    </main>
  );
}
