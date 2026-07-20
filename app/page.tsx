import Link from "next/link";

// Öffentliche Startseite. Ersetze diesen Inhalt durch deine Landingpage.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold">Deine Digistore-SAAS</h1>
      <p className="text-muted-foreground">
        Dieses Template ist mit Digistore24-Abrechnung vorbereitet. Den
        Digistore24-Zugang richtest du einmalig im Terminal ein
        (<code>make ds24-connect</code>), danach kannst du dich anmelden.
      </p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
        >
          Anmelden
        </Link>
        <Link href="/tarife" className="rounded-lg border px-4 py-2">
          Tarife
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
