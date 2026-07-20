import { signIn, auth } from "@/auth";
import { redirect } from "next/navigation";
import { isEmailLoginEnabled } from "@/lib/email";

// Anmeldeseite. Standard: E-Mail-Token-Login (Magic-Link, Postmark/SMTP).
// Google-Login optional (nur wenn GOOGLE_CLIENT_ID/SECRET gesetzt).
export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const emailEnabled = isEmailLoginEnabled();
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Anmelden</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Wir senden dir einen Anmelde-Link per E-Mail — kein Passwort nötig.
        </p>
      </div>

      {emailEnabled && (
        <form
          action={async (formData: FormData) => {
            "use server";
            await signIn("email", {
              email: String(formData.get("email")),
              redirectTo: "/dashboard",
            });
          }}
          className="flex flex-col gap-3 rounded-xl border bg-card p-6"
        >
          <label htmlFor="email" className="text-sm font-medium">
            E-Mail-Adresse
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="du@example.com"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button className="w-full rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">
            Anmelde-Link senden
          </button>
        </form>
      )}

      {emailEnabled && googleEnabled && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          oder
          <span className="h-px flex-1 bg-border" />
        </div>
      )}

      {googleEnabled && (
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <button className="w-full rounded-lg border bg-background px-4 py-2">
            Weiter mit Google
          </button>
        </form>
      )}

      {!emailEnabled && !googleEnabled && (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Kein Login-Verfahren konfiguriert. Hinterlege einen E-Mail-Versand
          (Postmark oder SMTP) — optional Google. Siehe{" "}
          <code>docs/auth-setup.md</code> und <code>.env.example</code>.
        </p>
      )}
    </main>
  );
}
