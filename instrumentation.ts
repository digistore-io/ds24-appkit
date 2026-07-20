// Läuft einmal beim Serverstart (Next.js Instrumentation Hook).
//
// Zweck: die Umgebungs-Regeln aus lib/env-guard.ts durchsetzen, BEVOR die App
// Anfragen annimmt. In STAGING und PROD ist der E-Mail-Versand Pflicht — fehlt
// er, startet die App nicht. Lieber ein klarer Abbruch beim Deploy als eine
// laufende App, bei der sich niemand anmelden kann.
export async function register() {
  // Nur in der Node-Runtime prüfen (nicht im Edge-Runtime-Durchlauf).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Nur env-guard importieren — NICHT lib/email: das hängt an nodemailer, und
  // dieser Hook wird auch für die Edge-Runtime gebaut. Ein Import von dort
  // bricht den Start mit "Can't resolve 'stream'".
  const { pruefeUmgebung, appEnv, istEmailKonfiguriert } = await import(
    "@/lib/env-guard"
  );

  const umgebung = appEnv(process.env.APP_ENV);
  const probleme = pruefeUmgebung({
    APP_ENV: process.env.APP_ENV,
    NODE_ENV: process.env.NODE_ENV,
    AUTH_SECRET: process.env.AUTH_SECRET,
    emailKonfiguriert: istEmailKonfiguriert(process.env),
  });

  if (probleme.length > 0) {
    console.error("\n✗ Start abgebrochen — die Umgebung ist nicht startklar:\n");
    for (const p of probleme) console.error(`  • ${p}\n`);
    throw new Error(
      `Umgebung ${umgebung} ist nicht korrekt konfiguriert (${probleme.length} Problem(e)).`,
    );
  }

  console.log(`✓ Umgebung: ${umgebung.toUpperCase()}`);
}
