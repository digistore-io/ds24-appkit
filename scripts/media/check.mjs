// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Checks the media layer — where files go, whether that place answers, and what
// this app will and will not accept.
//
//   node run.mjs media-check
//
// Four jobs, and the second is the one nothing else can do for you:
//
//  1. **The driver.** Which store this machine is set to, and — the question
//     that actually bites — whether it is one that survives a redeploy.
//  2. **A real round trip.** It writes a throwaway object, reads it back,
//     compares the bytes and deletes it. Credentials that look right and a
//     bucket that does not exist are indistinguishable until something tries,
//     and "tries" is the whole point of this command. It signs through
//     `lib/media/s3-request.mjs`, which is the same code the app uses — a check
//     with its own second implementation proves that the second implementation
//     works.
//  3. **The rules.** What may be uploaded, by whom, how large, and how long a
//     private address stays valid. Printed because the numbers are a product
//     decision somebody made once and nobody remembers.
//  4. **Delivery.** Whether public files reach visitors without touching the
//     app at all, which is the difference between a bucket and a bottleneck.
//
// Plain Node, no bundler, no TypeScript, no dependency — it has to run on
// Linux, macOS and in a Git Bash on Windows (CLAUDE.md, "Three systems").
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { s3SettingsFromEnv, sendS3 } from "../../lib/media/s3-request.mjs";
import "../lib/env.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

let failed = false;

function ok(line) {
  console.log(`  ✓ ${line}`);
}
function warn(line) {
  console.log(`  ! ${line}`);
}
function bad(line) {
  console.log(`  ✗ ${line}`);
  failed = true;
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 1)} MB`;
}

function duration(seconds) {
  if (seconds >= 3600) return `${Math.round(seconds / 3600)} h`;
  if (seconds >= 60) return `${Math.round(seconds / 60)} min`;
  return `${seconds} s`;
}

async function readConfig() {
  try {
    return JSON.parse(await readFile(join(ROOT, "config/media.json"), "utf8"));
  } catch (error) {
    bad(`config/media.json could not be read: ${error.message}`);
    return null;
  }
}

/** Is this a real environment, where a local disk is not storage? */
function isRealEnvironment(value) {
  const v = (value ?? "").trim().toLowerCase();
  return !(v === "" || v === "development" || v === "dev" || v === "local");
}

async function checkLocal() {
  const dir = resolve(ROOT, process.env.MEDIA_LOCAL_DIR?.trim() || ".data/media");
  const key = `.media-check/${randomUUID()}.txt`;
  const target = join(dir, key);
  const payload = Buffer.from(`media-check ${new Date().toISOString()}\n`);

  try {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, payload);
    const back = await readFile(target);
    if (!back.equals(payload)) {
      bad("wrote a file and read something else back");
      return;
    }
    await rm(target, { force: true });
    ok(`wrote, read and deleted a test file in ${dir}`);
  } catch (error) {
    bad(`cannot write to ${dir}: ${error.message}`);
  }
}

async function checkS3() {
  const settings = s3SettingsFromEnv();
  if (!settings) {
    bad(
      "MEDIA_DRIVER=s3, but the bucket is not configured. Needs " +
        "MEDIA_S3_ENDPOINT, MEDIA_S3_BUCKET, MEDIA_S3_ACCESS_KEY_ID and " +
        "MEDIA_S3_SECRET_ACCESS_KEY — see .env.example",
    );
    return null;
  }

  ok(`bucket "${settings.bucket}" at ${settings.endpoint} (region ${settings.region})`);

  const key = `.media-check/${randomUUID()}.txt`;
  const payload = Buffer.from(`media-check ${new Date().toISOString()}\n`);

  let written = false;
  try {
    const put = await sendS3(settings, "PUT", key, payload, "text/plain");
    if (!put.ok) {
      const body = (await put.text()).slice(0, 300);
      bad(`writing failed (HTTP ${put.status}) ${body}`);
      // The provider's own error code is the useful part, so it is printed
      // above rather than swallowed. `SignatureDoesNotMatch` means the
      // credentials or the clock; `NoSuchBucket` means the name or the region.
      return settings;
    }
    written = true;
    ok("wrote a test object");

    const get = await sendS3(settings, "GET", key);
    if (!get.ok) {
      bad(`reading it back failed (HTTP ${get.status})`);
    } else {
      const back = Buffer.from(await get.arrayBuffer());
      if (back.equals(payload)) ok("read it back, byte for byte");
      else bad("read it back and the bytes differ");
    }
  } catch (error) {
    bad(`the bucket is not reachable: ${error.message}`);
  } finally {
    if (written) {
      try {
        const del = await sendS3(settings, "DELETE", key);
        if (del.ok || del.status === 404) ok("deleted it again");
        else bad(`could not delete the test object (HTTP ${del.status}) — key ${key}`);
      } catch (error) {
        bad(`could not delete the test object: ${error.message} — key ${key}`);
      }
    }
  }

  return settings;
}

async function main() {
  const config = await readConfig();
  const driver = (process.env.MEDIA_DRIVER ?? "").trim().toLowerCase() || "local";
  const realEnvironment = isRealEnvironment(process.env.APP_ENV);

  console.log("\nWhere files go\n");

  if (driver === "local") {
    if (realEnvironment) {
      // The single most consequential thing this command can say.
      bad(
        `APP_ENV=${process.env.APP_ENV} with MEDIA_DRIVER unset or "local". ` +
          "Files would go on this machine's disk: the next redeploy loses them " +
          "all, and a second instance cannot see what the first one wrote — so " +
          "a customer's picture is there about half the time and nobody can " +
          "reproduce it. The app refuses to start like this. Book a bucket " +
          "(the `setup-hosting` skill does it) and set MEDIA_DRIVER=s3.",
      );
    } else {
      ok("driver: local disk — fine for development, and only for development");
      warn(
        "before going online this has to become a bucket, or the app will not start",
      );
    }
    await checkLocal();
  } else if (driver === "s3") {
    ok("driver: object storage — survives a redeploy and a second instance");
    const settings = await checkS3();

    console.log("\nHow visitors get them\n");
    if (settings?.publicBaseUrl) {
      ok(
        `public files: straight from ${settings.publicBaseUrl} — no request ` +
          "reaches your app",
      );
    } else {
      warn(
        "MEDIA_S3_PUBLIC_BASE_URL is not set, so even public files are served " +
          "through a signed address. That works. Setting it (a CDN or a custom " +
          "domain on the bucket) makes product images cacheable and cheaper.",
      );
    }
    ok(
      "private files: the page decides who may see them, then the bucket " +
        "serves the bytes. Your app never carries them",
    );
  } else {
    bad(`MEDIA_DRIVER="${driver}" is not a driver. Use "s3", or "local" in development.`);
  }

  if (!config) {
    console.log("");
    process.exit(1);
  }

  console.log("\nWhat may go in\n");

  const kinds = config.kinds ?? {};
  for (const [kind, rule] of Object.entries(kinds)) {
    if (kind.startsWith("_")) continue;
    const types = (rule.mimeTypes ?? []).join(", ");
    console.log(
      `  ${kind.padEnd(6)} up to ${mb(rule.maxBytes).padStart(8)}   ` +
        `address valid ${duration(rule.signedUrlSeconds).padStart(6)}   ${types}`,
    );
  }

  console.log("");
  const known = new Set(
    Object.entries(kinds)
      .filter(([k]) => !k.startsWith("_"))
      .flatMap(([, rule]) => rule.mimeTypes ?? []),
  );
  for (const [role, list] of Object.entries(config.mayUpload ?? {})) {
    if (role.startsWith("_")) continue;
    console.log(`  ${role.padEnd(6)} may upload: ${list.join(", ")}`);
    for (const mime of list) {
      if (!known.has(mime)) {
        bad(
          `mayUpload.${role} allows "${mime}", which belongs to no kind — ` +
            "nobody could ever upload it",
        );
      }
    }
  }

  // The honest limit, stated every time rather than left in a document.
  console.log("");
  warn(
    "uploads travel through the app, so the ceilings above are what fits " +
      "through a request. A recording of several hundred megabytes needs the " +
      "browser to write straight to the bucket, which is not built yet — " +
      "docs/visuals.md says what that involves.",
  );
  warn(
    "location and camera data are stripped from uploaded IMAGES. Video keeps " +
      "whatever the recording device wrote (docs/data-protection.md).",
  );

  console.log("");
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(`\n✗ media-check failed: ${error.message}\n`);
  process.exit(1);
});
