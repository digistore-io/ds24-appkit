// Email delivery for the magic-link sign-in. Two transports, chosen by env:
//   1) Postmark  — POSTMARK_SERVER_TOKEN + POSTMARK_SENDER (verified sender)
//   2) SMTP      — SMTP_HOST/PORT/USER/PASSWORD (+ optional SMTP_SECURE, SMTP_FROM)
//
// If neither is configured, the email sign-in is disabled (the sign-in page
// then does not show it). nodemailer is loaded at runtime only (the SMTP path)
// — never import it in auth.config.ts (that config is shared with proxy.ts and
// has to stay free of Node-only dependencies).
import type { Provider } from "next-auth/providers";
import {
  hasPostmarkConfig,
  hasSmtpConfig,
  hasEmailConfig,
} from "@/lib/env-guard";

/** Product name for the email (optional). */
function appName(): string {
  return process.env.APP_NAME?.trim() || "";
}

// The detection lives in lib/env-guard.ts (pure env checks, without the
// nodemailer dependency) — here we only apply it to process.env, so that there
// is exactly one source of truth.
export function isPostmarkConfigured(): boolean {
  return hasPostmarkConfig(process.env);
}

export function isSmtpConfigured(): boolean {
  return hasSmtpConfig(process.env);
}

export function isEmailLoginEnabled(): boolean {
  return hasEmailConfig(process.env);
}

/** Sender address (From), depending on the configured transport. */
export function emailFrom(): string {
  return (
    (isPostmarkConfigured() ? process.env.POSTMARK_SENDER : process.env.SMTP_FROM) ||
    process.env.EMAIL_FROM ||
    "login@localhost"
  );
}

/**
 * The texts of the sign-in email — in the language of whoever is signing in.
 *
 * The language comes from the running request (cookie or browser header),
 * because it was in exactly that request that the person clicked "send sign-in
 * link". That is why the texts are built here and not somewhere in the
 * background at send time.
 */
interface MailTexts {
  locale: string;
  subject: string;
  heading: string;
  body: string;
  cta: string;
  fallback: string;
  intro: string;
}

async function mailTexts(): Promise<MailTexts> {
  const { getLocale, getTranslations } = await import("next-intl/server");
  const t = await getTranslations("email");
  const name = appName();
  return {
    locale: await getLocale(),
    subject: name ? t("subjectForApp", { app: name }) : t("subject"),
    heading: name ? t("headingForApp", { app: name }) : t("heading"),
    body: t("body"),
    cta: t("cta"),
    fallback: t("fallback"),
    intro: t("textBody"),
  };
}

/** Keeps interpolated values from taking the email's HTML apart. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlBody(url: string, texts: MailTexts): string {
  const href = escapeHtml(url);
  return `<!doctype html><html lang="${texts.locale}"><body style="font-family:system-ui,Segoe UI,sans-serif;background:#f5f5fa;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #eee">
    <h1 style="font-size:20px;margin:0 0 8px">${escapeHtml(texts.heading)}</h1>
    <p style="color:#555;margin:0 0 24px">${escapeHtml(texts.body)}</p>
    <a href="${href}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${escapeHtml(texts.cta)}</a>
    <p style="color:#999;font-size:12px;margin:24px 0 0">${escapeHtml(texts.fallback)}<br>${href}</p>
  </div></body></html>`;
}

function textBody(url: string, texts: MailTexts): string {
  return `${texts.heading}\n\n${texts.intro}\n${url}\n`;
}

async function sendViaPostmark(to: string, url: string): Promise<void> {
  const texts = await mailTexts();
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
      Subject: texts.subject,
      HtmlBody: htmlBody(url, texts),
      TextBody: textBody(url, texts),
      MessageStream: process.env.POSTMARK_MESSAGE_STREAM || "outbound",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Postmark delivery failed (HTTP ${res.status}): ${await res.text()}`);
  }
}

async function sendViaSmtp(to: string, url: string): Promise<void> {
  const texts = await mailTexts();
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true", // true = 465, otherwise STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  await transport.sendMail({
    to,
    from: emailFrom(),
    subject: texts.subject,
    text: textBody(url, texts),
    html: htmlBody(url, texts),
  });
}

/** Sends the magic link to the destination address. Throws on failure. */
export async function sendLoginEmail(to: string, url: string): Promise<void> {
  if (isPostmarkConfigured()) return sendViaPostmark(to, url);
  if (isSmtpConfigured()) return sendViaSmtp(to, url);
  throw new Error("No email transport configured (Postmark or SMTP).");
}

/**
 * Builds the Auth.js email provider (magic link). Uses the adapter for the
 * verification tokens (in auth.ts). Returns null if no transport is set.
 */
export function buildEmailProvider(): Provider | null {
  if (!isEmailLoginEnabled()) return null;
  return {
    id: "email",
    type: "email",
    name: "Email",
    from: emailFrom(),
    maxAge: 24 * 60 * 60,
    async sendVerificationRequest({ identifier, url }: { identifier: string; url: string }) {
      await sendLoginEmail(identifier, url);
    },
    options: {},
  } as Provider;
}
