#!/usr/bin/env node
// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Set up mail delivery for the sign-in — interactive.
//
// Asks for the credentials, writes them into .env (which is gitignored) and
// sends a test mail on request. Afterwards the development sign-in disappears
// automatically and the magic-link sign-in is active.
//
// Two ways — exactly ONE of them gets configured:
//   Postmark  service with a free allowance; needs a server token
//             and a verified sender address (sender signature).
//   SMTP      any mail server/mailbox (your own provider's too).
//
// Usage:  node scripts/dev/mail-setup.mjs   (or: node run.mjs mail-setup)
import { createInterface } from "node:readline/promises";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import "../lib/env.mjs";

const ENV_FILE = ".env";
const rl = createInterface({ input: process.stdin, output: process.stdout });

/** Question with an optional default value. */
async function ask(text, fallback = "") {
  const suffix = fallback ? ` [${fallback}]` : "";
  const answer = (await rl.question(`${text}${suffix}: `)).trim();
  return answer || fallback;
}

/** Required field — keeps asking until something is there. */
async function askRequired(text, fallback = "") {
  for (;;) {
    const value = await ask(text, fallback);
    if (value) return value;
    console.log("  (required)");
  }
}

/**
 * Writes values into .env: existing lines (commented-out ones too) are
 * replaced, missing ones are appended. The rest of the file stays untouched.
 */
function writeEnv(values) {
  if (!existsSync(ENV_FILE)) {
    writeFileSync(ENV_FILE, existsSync(".env.example") ? readFileSync(".env.example", "utf8") : "");
  }
  let content = readFileSync(ENV_FILE, "utf8");
  for (const [key, value] of Object.entries(values)) {
    const re = new RegExp(`^#?\\s*${key}=.*$`, "m");
    const line = `${key}=${value}`;
    content = re.test(content)
      ? content.replace(re, line)
      : content.replace(/\n*$/, "\n") + line + "\n";
  }
  writeFileSync(ENV_FILE, content);
}

/** Comments out lines so that two transports are never set at the same time. */
function disable(keys) {
  if (!existsSync(ENV_FILE)) return;
  let content = readFileSync(ENV_FILE, "utf8");
  for (const key of keys) {
    content = content.replace(new RegExp(`^(${key}=.*)$`, "m"), "# $1");
  }
  writeFileSync(ENV_FILE, content);
}

// Sends a test mail with the values just entered (the caller puts them into
// process.env via Object.assign beforehand).
async function sendTestMail(to) {
  const isPostmark = Boolean(process.env.POSTMARK_SERVER_TOKEN && process.env.POSTMARK_SENDER);
  const from = isPostmark ? process.env.POSTMARK_SENDER : process.env.SMTP_FROM || process.env.EMAIL_FROM;
  const subject = "Test mail from your app";
  const text = "If you are reading this, mail delivery works.\nThe magic-link sign-in is ready to use now.";

  if (isPostmark) {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN,
      },
      body: JSON.stringify({
        From: from,
        To: to,
        Subject: subject,
        TextBody: text,
        MessageStream: process.env.POSTMARK_MESSAGE_STREAM || "outbound",
      }),
    });
    if (!res.ok) throw new Error(`Postmark ${res.status}: ${await res.text()}`);
    return;
  }

  const nodemailer = (await import("nodemailer")).default;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE) === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  await transport.sendMail({ from, to, subject, text });
}

// ---------------------------------------------------------------------------

console.log("\nSet up mail delivery for the sign-in");
console.log("────────────────────────────────────");
console.log("The sign-in link (magic link) is sent by email. For that the app");
console.log("needs a mail account. As long as none is set up, there is the");
console.log("development sign-in locally — but not in staging and production:");
console.log("there, mail delivery is mandatory.\n");
console.log("  1) Postmark  — a service, free allowance, very reliable");
console.log("  2) SMTP      — your own mail server or your provider's mailbox\n");

const choice = await ask("How would you like to send? (1/2)", "1");

let values;
if (choice === "2" || choice.toLowerCase().startsWith("s")) {
  console.log("\nSMTP credentials (you get them from your mail provider):");
  const host = await askRequired("  Server (SMTP_HOST), e.g. smtp.strato.de", process.env.SMTP_HOST || "");
  const port = await ask("  Port (587 = STARTTLS, 465 = SSL)", process.env.SMTP_PORT || "587");
  const user = await askRequired("  Username", process.env.SMTP_USER || "");
  const pass = await askRequired("  Password", process.env.SMTP_PASSWORD || "");
  const from = await askRequired("  Sender address (From)", process.env.SMTP_FROM || user);
  values = {
    SMTP_HOST: host,
    SMTP_PORT: port,
    SMTP_SECURE: port === "465" ? "true" : "false",
    SMTP_USER: user,
    SMTP_PASSWORD: pass,
    SMTP_FROM: from,
    EMAIL_FROM: from,
  };
  disable(["POSTMARK_SERVER_TOKEN", "POSTMARK_SENDER"]);
} else {
  console.log("\nPostmark credentials (Server → API Tokens):");
  console.log("The sender address has to be verified there as a sender signature.");
  const token = await askRequired("  Server token", process.env.POSTMARK_SERVER_TOKEN || "");
  const sender = await askRequired("  Sender address", process.env.POSTMARK_SENDER || "");
  const stream = await ask("  Message stream", process.env.POSTMARK_MESSAGE_STREAM || "outbound");
  values = {
    POSTMARK_SERVER_TOKEN: token,
    POSTMARK_SENDER: sender,
    POSTMARK_MESSAGE_STREAM: stream,
    EMAIL_FROM: sender,
  };
  disable(["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"]);
}

writeEnv(values);
console.log(`\n✓ Saved in ${ENV_FILE} (that file is gitignored).`);

const to = await ask("\nSend a test mail to (empty = skip)", "");
if (to) {
  try {
    Object.assign(process.env, values);
    await sendTestMail(to);
    console.log(`✓ Test mail sent to ${to}. Have a look in your inbox (spam too).`);
  } catch (e) {
    console.error(`\n✗ Delivery failed: ${e.message}`);
    console.error("  Check the credentials and run `node run.mjs mail-setup` again.");
    rl.close();
    process.exit(1);
  }
}

console.log("\nNext step: node run.mjs restart");
console.log("After that the magic-link sign-in is active and the development sign-in is gone.");
rl.close();
