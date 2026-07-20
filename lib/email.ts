// E-Mail-Versand für den Magic-Link-Login. Zwei Transporte, per Env gewählt:
//   1) Postmark  — POSTMARK_SERVER_TOKEN + POSTMARK_SENDER (verifizierter Absender)
//   2) SMTP      — SMTP_HOST/PORT/USER/PASSWORD (+ optional SMTP_SECURE, SMTP_FROM)
//
// Ist keiner konfiguriert, ist der E-Mail-Login deaktiviert (die Login-Seite zeigt
// ihn dann nicht an). nodemailer wird nur zur Laufzeit (SMTP-Pfad) geladen —
// niemals in auth.config.ts importieren (sonst landet es im Edge-Middleware-Bundle).
import type { Provider } from "next-auth/providers";

/** Produktname für die E-Mail (optional). */
function appName(): string {
  return process.env.APP_NAME?.trim() || "";
}

export function isPostmarkConfigured(): boolean {
  return Boolean(process.env.POSTMARK_SERVER_TOKEN && process.env.POSTMARK_SENDER);
}

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

export function isEmailLoginEnabled(): boolean {
  return isPostmarkConfigured() || isSmtpConfigured();
}

/** Absender-Adresse (From) je nach konfiguriertem Transport. */
export function emailFrom(): string {
  return (
    (isPostmarkConfigured() ? process.env.POSTMARK_SENDER : process.env.SMTP_FROM) ||
    process.env.EMAIL_FROM ||
    "login@localhost"
  );
}

function subject(): string {
  const name = appName();
  return name ? `Dein Anmelde-Link für ${name}` : "Dein Anmelde-Link";
}

function heading(): string {
  const name = appName();
  return name ? `Anmelden bei ${name}` : "Anmelden";
}

function htmlBody(url: string): string {
  return `<!doctype html><html lang="de"><body style="font-family:system-ui,Segoe UI,sans-serif;background:#f5f5fa;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #eee">
    <h1 style="font-size:20px;margin:0 0 8px">${heading()}</h1>
    <p style="color:#555;margin:0 0 24px">Klicke auf den Button, um dich anzumelden. Der Link ist 24&nbsp;Stunden gültig.</p>
    <a href="${url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Jetzt anmelden</a>
    <p style="color:#999;font-size:12px;margin:24px 0 0">Falls der Button nicht funktioniert, kopiere diesen Link:<br>${url}</p>
  </div></body></html>`;
}

function textBody(url: string): string {
  return `${heading()}\n\nÖffne diesen Link, um dich anzumelden (24h gültig):\n${url}\n`;
}

async function sendViaPostmark(to: string, url: string): Promise<void> {
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN as string,
    },
    body: JSON.stringify({
      From: emailFrom(),
      To: to,
      Subject: subject(),
      HtmlBody: htmlBody(url),
      TextBody: textBody(url),
      MessageStream: process.env.POSTMARK_MESSAGE_STREAM || "outbound",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Postmark-Versand fehlgeschlagen (HTTP ${res.status}): ${await res.text()}`);
  }
}

async function sendViaSmtp(to: string, url: string): Promise<void> {
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true", // true = 465, sonst STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  await transport.sendMail({
    to,
    from: emailFrom(),
    subject: subject(),
    text: textBody(url),
    html: htmlBody(url),
  });
}

/** Versendet den Magic-Link an die Zieladresse. Wirft bei Fehler. */
export async function sendLoginEmail(to: string, url: string): Promise<void> {
  if (isPostmarkConfigured()) return sendViaPostmark(to, url);
  if (isSmtpConfigured()) return sendViaSmtp(to, url);
  throw new Error("Kein E-Mail-Transport konfiguriert (Postmark oder SMTP).");
}

/**
 * Baut den Auth.js-E-Mail-Provider (Magic-Link). Nutzt den Adapter für die
 * Verifikations-Tokens (in auth.ts). Gibt null zurück, wenn kein Transport gesetzt.
 */
export function buildEmailProvider(): Provider | null {
  if (!isEmailLoginEnabled()) return null;
  return {
    id: "email",
    type: "email",
    name: "E-Mail",
    from: emailFrom(),
    maxAge: 24 * 60 * 60,
    async sendVerificationRequest({ identifier, url }: { identifier: string; url: string }) {
      await sendLoginEmail(identifier, url);
    },
    options: {},
  } as Provider;
}
