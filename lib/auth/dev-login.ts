// Entwicklungs-Login — meldet ohne Magic-Link und ohne Passwort an.
//
// ============================================================================
// WARNUNG: Das ist ein bewusster Auth-Bypass. Er existiert NUR, damit man die
// eigene App ausprobieren kann, bevor der E-Mail-Versand eingerichtet ist.
// Wäre er in Produktion aktiv, könnte sich jeder als beliebiger Nutzer
// anmelden — inklusive als Admin.
//
// Er gilt ausschließlich in der Umgebung DEV. Das ist eine Allowlist, keine
// Ausschlussliste: Alles, was nicht eindeutig als Entwicklung erkannt wird,
// gilt als Produktion und sperrt (siehe appEnv() in lib/env-guard.ts — ein
// Tippfehler in APP_ENV führt dort zu "production", nicht zu "development").
//
// VIER unabhängige Bedingungen, alle müssen gelten:
//   1. APP_ENV ergibt "development" (STAGING und PROD sind ausgeschlossen)
//   2. NODE_ENV ist nicht "production"  — beim `next build`/`next start` weg
//   3. APP_URL zeigt auf localhost      — ein echtes Deployment ist nie offen
//   4. Es ist KEIN Mailversand konfiguriert — sobald Postmark oder SMTP
//      eingerichtet ist, verschwindet der Bypass automatisch
//
// In STAGING/PROD ist der Mailversand Pflicht; fehlt er, startet die App gar
// nicht erst (instrumentation.ts → pruefeUmgebung).
//
// Ausschalten kann man ihn jederzeit hart: DEV_LOGIN=off in der .env.
// ============================================================================
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";
import { isEmailLoginEnabled } from "@/lib/email";
import { appEnv } from "@/lib/env-guard";

export interface DevLoginEnv {
  NODE_ENV?: string;
  APP_ENV?: string;
  APP_URL?: string;
  DEV_LOGIN?: string;
  emailKonfiguriert: boolean;
}

/** true, wenn die URL auf den eigenen Rechner zeigt. */
export function istLokal(appUrl?: string): boolean {
  if (!appUrl) return true; // nicht gesetzt = lokale Entwicklung
  try {
    const host = new URL(appUrl).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false; // unparsebar → im Zweifel gesperrt
  }
}

/**
 * Die eine Stelle, die entscheidet, ob der Entwicklungs-Login existiert.
 * Bewusst als reine Funktion — sie ist sicherheitskritisch und wird in
 * lib/auth/dev-login.test.ts einzeln geprüft.
 */
export function istDevLoginErlaubt(env: DevLoginEnv): boolean {
  if (env.DEV_LOGIN === "off") return false;
  // Allowlist: NUR die Umgebung DEV. appEnv() stuft alles Unbekannte als
  // "production" ein — ein Tippfehler öffnet den Bypass also nicht.
  if (appEnv(env.APP_ENV) !== "development") return false;
  if (env.NODE_ENV === "production") return false;
  if (env.emailKonfiguriert) return false;
  if (!istLokal(env.APP_URL)) return false;
  return true;
}

/** Liest die Bedingungen aus der echten Umgebung. */
export function devLoginAktiv(): boolean {
  return istDevLoginErlaubt({
    NODE_ENV: process.env.NODE_ENV,
    APP_ENV: process.env.APP_ENV,
    APP_URL: process.env.APP_URL,
    DEV_LOGIN: process.env.DEV_LOGIN,
    emailKonfiguriert: isEmailLoginEnabled(),
  });
}

/**
 * Adresse, die der Anmeldeseite als Vorschlag dient: bevorzugt der aelteste
 * Admin, sonst der aelteste Nutzer. Gibt null zurueck, solange die App keine
 * Nutzer hat — dann darf man sich mit einer beliebigen Adresse anmelden.
 *
 * Nur fuer die Anzeige im Demo-Betrieb. Rechte haengen nicht daran; wer sich
 * anmeldet, bekommt die Rolle des Kontos aus der Datenbank.
 */
export async function demoLoginVorschlag(): Promise<string | null> {
  if (!devLoginAktiv()) return null;
  try {
    const { db } = await import("@/db");
    const { users } = await import("@/db/schema");
    const { asc, sql } = await import("drizzle-orm");

    const [treffer] = await db
      .select({ email: users.email })
      .from(users)
      // Admins zuerst, danach nach Alter — das ist in aller Regel das Konto,
      // das der Betreiber sich per `make user-create` angelegt hat.
      .orderBy(sql`case when ${users.role} = 'owner' then 0 else 1 end`, asc(users.createdAt))
      .limit(1);
    return treffer?.email ?? null;
  } catch {
    // Keine DB erreichbar (z. B. Container noch nicht gestartet) — die
    // Anmeldeseite soll deswegen nicht kaputtgehen.
    return null;
  }
}

/**
 * Baut den Provider — oder null, wenn er nicht erlaubt ist.
 *
 * Der Nutzer gibt nur eine E-Mail-Adresse ein. Existiert sie, wird dieses Konto
 * verwendet (samt Rolle); sonst wird ein neues Konto als "member" angelegt —
 * genau wie beim Magic-Link-Login.
 */
export function buildDevLoginProvider(): Provider | null {
  if (!devLoginAktiv()) return null;

  console.warn(
    "\n⚠️  ENTWICKLUNGS-LOGIN AKTIV — Anmeldung ohne Passwort und ohne Magic-Link.\n" +
      "   Grund: kein Mailversand konfiguriert. Einrichten mit: make mail-setup\n",
  );

  return Credentials({
    id: "dev-login",
    name: "Entwicklungs-Login",
    credentials: { email: { label: "E-Mail", type: "email" } },
    async authorize(credentials) {
      // Zweite Prüfung zur Laufzeit: Wird der Provider trotz geänderter
      // Umgebung noch aufgerufen, ist hier Schluss.
      if (!devLoginAktiv()) return null;

      const email = String(credentials?.email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

      // Erst zur Laufzeit laden — hält die DB aus dem Edge-/Client-Bundle raus.
      const { db } = await import("@/db");
      const { users } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");

      const [vorhanden] = await db
        .select({ id: users.id, email: users.email, name: users.name, role: users.role })
        .from(users)
        .where(eq(users.email, email));
      if (vorhanden) return vorhanden;

      const [neu] = await db
        .insert(users)
        .values({ email, emailVerified: new Date() })
        .returning({ id: users.id, email: users.email, name: users.name, role: users.role });
      return neu;
    },
  });
}
