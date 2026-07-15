import { signIn, auth } from "@/auth";
import { redirect } from "next/navigation";

// Anmeldeseite. Zeigt die aktivierten Provider (Google und/oder E-Mail).
export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
  const emailEnabled = Boolean(
    process.env.AUTH_RESEND_KEY && process.env.EMAIL_FROM,
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Anmelden</h1>

      {googleEnabled && (
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <button className="w-full rounded-lg border px-4 py-2">
            Weiter mit Google
          </button>
        </form>
      )}

      {emailEnabled && (
        <form
          action={async (formData: FormData) => {
            "use server";
            await signIn("resend", {
              email: String(formData.get("email")),
              redirectTo: "/dashboard",
            });
          }}
          className="flex flex-col gap-2"
        >
          <input
            name="email"
            type="email"
            required
            placeholder="du@example.com"
            className="rounded-lg border px-3 py-2"
          />
          <button className="w-full rounded-lg bg-primary px-4 py-2 text-primary-foreground">
            Magic-Link per E-Mail
          </button>
        </form>
      )}

      {!googleEnabled && !emailEnabled && (
        <p className="text-sm text-muted-foreground">
          Kein Auth-Provider konfiguriert. Setze Google- oder E-Mail-Variablen in
          <code> .env</code> (siehe <code>.env.example</code>).
        </p>
      )}
    </main>
  );
}
