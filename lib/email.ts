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

/**
 * One finished message. Everything above this line composes one; everything
 * below only delivers it.
 *
 * The split exists because not every mail this app sends is a link. The sign-in
 * mail is; the credential-change notice deliberately is NOT, and before the
 * split every transport function took a `url` as its second argument, which
 * left no shape for a mail that must not carry one.
 */
export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

async function sendViaPostmark(mail: Mail): Promise<void> {
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN as string,
    },
    body: JSON.stringify({
      From: emailFrom(),
      To: mail.to,
      Subject: mail.subject,
      HtmlBody: mail.html,
      TextBody: mail.text,
      MessageStream: process.env.POSTMARK_MESSAGE_STREAM || "outbound",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Postmark delivery failed (HTTP ${res.status}): ${await res.text()}`);
  }
}

async function sendViaSmtp(mail: Mail): Promise<void> {
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true", // true = 465, otherwise STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  await transport.sendMail({
    to: mail.to,
    from: emailFrom(),
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}

/** Hands one finished message to whichever transport is configured. */
async function deliver(mail: Mail): Promise<void> {
  if (isPostmarkConfigured()) return sendViaPostmark(mail);
  if (isSmtpConfigured()) return sendViaSmtp(mail);
  throw new Error("No email transport configured (Postmark or SMTP).");
}

/** Sends the magic link to the destination address. Throws on failure. */
export async function sendLoginEmail(to: string, url: string): Promise<void> {
  const texts = await mailTexts();
  return deliver({
    to,
    subject: texts.subject,
    text: textBody(url, texts),
    html: htmlBody(url, texts),
  });
}

// --- Credential-change notice ------------------------------------------------
//
// The second mail this app sends, and the opposite shape from the first.
//
// It exists for one case: somebody who is NOT the account's owner reaches an
// unlocked machine, opens the account page and sets a password on themselves.
// They walk away with a credential that outlives the session they borrowed, and
// without this mail the real owner never finds out. Everything else about the
// design deals with that person having to prove something; this deals with the
// case where they did not have to.
//
// ⛔ IT CARRIES NO LINK, AND MUST NOT GROW ONE. Not a "wasn't me" button, not a
// revoke link, not a login link. A security notice that acts on a click is a
// phishing template with our sender address on it — and one that cannot act is
// useless to forge, which is precisely what makes it safe to send to somebody
// whose account may already be in the wrong hands. lib/email.test.ts asserts it.
// What the recipient does with it is contact the Operator.

/**
 * Every kind of credential change, as a value rather than only a type.
 *
 * It exists so a test can walk it. The texts are looked up with a COMPUTED key
 * (`credentialSubject_${change}`), which no parity check can see: adding a
 * fourth change and forgetting its subject shipped the literal string
 * "email.credentialSubject_emailChanged" as a subject line once already, and
 * every test was green while it did. `i18n/messages.test.ts` now walks this.
 */
export const CREDENTIAL_CHANGES = [
  "passwordSet",
  "passwordChanged",
  "passwordRemoved",
  "emailChanged",
] as const;

/** Which credential moved. Deliberately closed — see the i18n keys below. */
export type CredentialChange =
  | "passwordSet"
  | "passwordChanged"
  | "passwordRemoved"
  /**
   * Sent to the address the account has just LEFT — the only party who needs
   * warning is the one losing the account. It names the address it moved to,
   * deliberately: if this was not the owner, that string is the single most
   * useful thing they can hand the Operator.
   */
  | "emailChanged";

export interface CredentialTexts {
  locale: string;
  subject: string;
  heading: string;
  what: string;
  when: string;
  notYou: string;
}

async function credentialTexts(
  change: CredentialChange,
  at: Date,
  detail?: string,
): Promise<CredentialTexts> {
  const { getLocale, getTranslations, getFormatter } = await import(
    "next-intl/server"
  );
  const t = await getTranslations("email");
  const format = await getFormatter();
  const name = appName();

  // Pinned to UTC and SAID so in the text. A security notice whose timestamp
  // is ambiguous invites the recipient to talk themselves out of it ("that
  // might have been me, an hour out") — which is the one reaction it exists to
  // prevent.
  const when = format.dateTime(at, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });

  // The subject names WHICH change, not merely that there was one. It is what
  // the recipient reads in a list of unopened mail, and it is where they decide
  // whether this needs them right now — "a password was created" is alarming to
  // somebody who created none, while a generic "something changed" is not.
  const subject = t(`credentialSubject_${change}`);

  return {
    locale: await getLocale(),
    subject: name ? t("credentialSubjectApp", { subject, app: name }) : subject,
    heading: t("credentialHeading"),
    // `emailChanged` is the one that carries a value — the address the account
    // moved to. next-intl requires every placeholder a message declares, so the
    // others are called without one.
    what:
      change === "emailChanged"
        ? t("credential_emailChanged", { email: detail ?? "" })
        : t(`credential_${change}`),
    when: t("credentialWhen", { when }),
    notYou: t("credentialNotYou"),
  };
}

/**
 * The two bodies, built from finished texts. Pure on purpose: this is where the
 * "no link" rule either holds or quietly stops holding, and a pure function is
 * one a test can hold to it.
 */
export function credentialBodies(texts: CredentialTexts): {
  html: string;
  text: string;
} {
  const html = `<!doctype html><html lang="${texts.locale}"><body style="font-family:system-ui,Segoe UI,sans-serif;background:#f5f5fa;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #eee">
    <h1 style="font-size:20px;margin:0 0 8px">${escapeHtml(texts.heading)}</h1>
    <p style="color:#333;margin:0 0 8px">${escapeHtml(texts.what)}</p>
    <p style="color:#555;margin:0 0 24px">${escapeHtml(texts.when)}</p>
    <p style="color:#999;font-size:12px;margin:0">${escapeHtml(texts.notYou)}</p>
  </div></body></html>`;

  const text = `${texts.heading}\n\n${texts.what}\n${texts.when}\n\n${texts.notYou}\n`;
  return { html, text };
}

/**
 * Tells the Member that a credential on their account changed.
 *
 * Throws like every other send — the CALLER decides that a failure here must
 * not undo the change that has already happened (see
 * app/dashboard/account/actions.ts). Swallowing it in here would hide a broken
 * mail setup from the logs entirely.
 */
export async function sendCredentialChangeEmail(
  to: string,
  change: CredentialChange,
  at: Date,
  /** For `emailChanged`: the address the account moved to. */
  detail?: string,
): Promise<void> {
  const texts = await credentialTexts(change, at, detail);
  const { html, text } = credentialBodies(texts);
  return deliver({ to, subject: texts.subject, text, html });
}

// --- Address-change confirmation ---------------------------------------------

/**
 * The link that actually moves an account, sent to the address it would move
 * TO — and to no other. Following it is the entire proof that the requester can
 * read mail there, which is the one thing standing between this feature and a
 * one-click account transfer for anybody who finds an unlocked screen.
 *
 * This one IS a link, unlike the notice above. The two shapes sit side by side
 * on purpose: what a mail is allowed to contain follows from who is supposed to
 * act on it. Here the recipient must act; there they must only be told.
 */
export async function sendEmailChangeConfirmation(
  to: string,
  url: string,
): Promise<void> {
  const { getLocale, getTranslations } = await import("next-intl/server");
  const t = await getTranslations("email");
  const name = appName();

  const texts: MailTexts = {
    locale: await getLocale(),
    subject: name
      ? t("confirmEmailSubjectForApp", { app: name })
      : t("confirmEmailSubject"),
    heading: t("confirmEmailHeading"),
    body: t("confirmEmailBody", { email: to }),
    cta: t("confirmEmailCta"),
    fallback: t("fallback"),
    intro: t("confirmEmailText", { email: to }),
  };

  return deliver({
    to,
    subject: texts.subject,
    text: textBody(url, texts),
    html: htmlBody(url, texts),
  });
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
