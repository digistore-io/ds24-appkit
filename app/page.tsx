import Link from "next/link";

// Öffentliche Startseite. Ersetze diesen Inhalt durch deine Landingpage.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold">Deine Digistore-SAAS</h1>
      <p className="text-muted-foreground">
        Dieses Template ist mit Digistore24-Abrechnung vorbereitet. Melde dich an
        und richte im Onboarding deinen Digistore24-Zugang ein.
      </p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
        >
          Anmelden
        </Link>
        <Link
          href="/dashboard"
          className="rounded-lg border px-4 py-2"
        >
          Zum Dashboard
        </Link>
      </div>
    </main>
  );
}
