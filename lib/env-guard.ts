// Umgebungs-Regeln: DEV / STAGING / PROD.
//
// Dieses Template kennt drei Umgebungen (siehe docs/environments.md). Sie
// unterscheiden sich nicht nur im Namen — an ihnen hängen harte Regeln:
//
//   DEV      lokal. Mailversand optional; solange keiner eingerichtet ist,
//            gibt es den Entwicklungs-Login (Anmeldung ohne Magic-Link).
//   STAGING  echte Domain, echte Nutzer-Tests. Mailversand ist PFLICHT,
//            Entwicklungs-Login ausgeschlossen.
//   PROD     echtes Geld, echte Kunden. Mailversand ist PFLICHT,
//            Entwicklungs-Login ausgeschlossen.
//
// Der Entwicklungs-Login ist ein Auth-Bypass (lib/auth/dev-login.ts). Damit er
// nicht durch ein vergessenes Env-Flag in eine echte Umgebung gerät, prüft
// diese Datei die Umgebung beim Serverstart (instrumentation.ts) und bricht ab,
// statt unsicher weiterzulaufen.

export type AppEnv = "development" | "staging" | "production";

// --- Erkennung des Mailversands ------------------------------------------
// Bewusst hier und nicht in lib/email.ts: Diese Prüfungen lesen nur Env-Werte
// und ziehen keine Abhängigkeiten nach. lib/email.ts hängt an nodemailer —
// würde instrumentation.ts von dort importieren, landete nodemailer im
// Edge-Bundle und die App startet nicht mehr ("Can't resolve 'stream'").

export interface MailEnv {
  POSTMARK_SERVER_TOKEN?: string;
  POSTMARK_SENDER?: string;
  SMTP_HOST?: string;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  // Index-Signatur, damit sich process.env direkt übergeben lässt.
  [key: string]: string | undefined;
}

export function istPostmarkKonfiguriert(env: MailEnv): boolean {
  return Boolean(env.POSTMARK_SERVER_TOKEN && env.POSTMARK_SENDER);
}

export function istSmtpKonfiguriert(env: MailEnv): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD);
}

/** true, wenn mindestens ein Transport vollständig konfiguriert ist. */
export function istEmailKonfiguriert(env: MailEnv): boolean {
  return istPostmarkKonfiguriert(env) || istSmtpKonfiguriert(env);
}

export interface UmgebungsEnv {
  APP_ENV?: string;
  NODE_ENV?: string;
  AUTH_SECRET?: string;
  emailKonfiguriert: boolean;
}

/**
 * Normalisiert APP_ENV. Unbekannte Werte gelten als "production" — im Zweifel
 * die strengste Umgebung, nicht die lockerste.
 */
export function appEnv(wert?: string): AppEnv {
  const v = (wert ?? "").trim().toLowerCase();
  if (v === "" || v === "development" || v === "dev" || v === "local") {
    return "development";
  }
  if (v === "staging" || v === "test") return "staging";
  return "production";
}

/** true für Umgebungen, die echte Nutzer sehen (STAGING und PROD). */
export function istEchteUmgebung(wert?: string): boolean {
  return appEnv(wert) !== "development";
}

/**
 * Prüft die Umgebung und liefert die Liste der Verstöße (leer = in Ordnung).
 * Reine Funktion, damit sie in lib/env-guard.test.ts einzeln geprüft werden kann.
 */
export function pruefeUmgebung(env: UmgebungsEnv): string[] {
  const probleme: string[] = [];
  const umgebung = appEnv(env.APP_ENV);

  if (umgebung === "development") return probleme;

  // Ab hier: STAGING oder PROD.
  if (!env.emailKonfiguriert) {
    probleme.push(
      `APP_ENV=${umgebung}: Es ist kein E-Mail-Versand konfiguriert. ` +
        "In STAGING und PROD ist er Pflicht — ohne ihn könnte sich niemand " +
        "anmelden, und der Entwicklungs-Login steht dort bewusst nicht zur " +
        "Verfügung. Setze Postmark (POSTMARK_SERVER_TOKEN + POSTMARK_SENDER) " +
        "oder SMTP (SMTP_HOST + SMTP_USER + SMTP_PASSWORD).",
    );
  }

  if (!env.AUTH_SECRET) {
    probleme.push(
      `APP_ENV=${umgebung}: AUTH_SECRET fehlt. Ohne Geheimnis lassen sich ` +
        "Sitzungen nicht sicher signieren. Erzeugen mit: openssl rand -hex 32",
    );
  }

  return probleme;
}
