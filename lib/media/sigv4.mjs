// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// AWS Signature Version 4, in about a hundred and fifty lines of `node:crypto`.
//
// ── Why this is here and not in `package.json` ─────────────────────────────
// `@aws-sdk/client-s3` is a large dependency with a wide transitive tail, and
// this template shipped five AI providers without adding a runtime dependency
// at all. What we need from it is one signature algorithm whose correctness is
// entirely checkable — it is arithmetic with a published answer, not a protocol
// with edge cases. And the payoff is not just the saved megabytes: because the
// signature is ours, every S3-compatible provider is reachable by changing an
// endpoint. Amazon S3, DigitalOcean Spaces, Cloudflare R2, Backblaze B2 and
// Hetzner Object Storage all speak exactly this.
//
// ── How it is kept honest ──────────────────────────────────────────────────
// `sigv4.test.ts` measures this file against the vectors in
// `sigv4-vectors.json`, the way `lib/digistore/ipn.test.ts` measures the IPN
// signature against `ipn-vectors.json`. Read that file's header before touching
// anything here: a change that breaks a vector is a change that would have
// produced `SignatureDoesNotMatch` against a real bucket, which is a failure
// mode with no useful error message attached to it.
//
// ── The three places this gets subtly wrong ────────────────────────────────
// Each of these has cost somebody a day, so they are called out where they
// happen: `uriEncode` is not `encodeURIComponent`, the canonical query string
// is sorted AFTER encoding, and the payload hash for a presigned URL is the
// literal string `UNSIGNED-PAYLOAD` rather than the hash of nothing.
// ── Why this is `.mjs` and `sigv4.ts` is a facade over it ─────────────────
// `node run.mjs media-check` has to sign real requests to prove a bucket is
// reachable, and the scripts in this repo do not import TypeScript
// (CLAUDE.md, "Three systems"). The same split `lib/ai/task-rules.mjs` and
// `lib/ai/tasks.ts` already use: the logic lives here where both a script and
// the app can reach it, and the types live next door.
import { createHash, createHmac } from "node:crypto";

export const ALGORITHM = "AWS4-HMAC-SHA256";

/** The literal a presigned URL carries instead of a body hash. */
export const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

/** SHA-256 of an empty body — what a GET, HEAD or DELETE signs. */
export const EMPTY_PAYLOAD_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key, data) {
  return new Uint8Array(createHmac("sha256", key).update(data, "utf8").digest());
}

/**
 * Percent-encoding as AWS defines it — **not** `encodeURIComponent`.
 *
 * The two disagree on exactly the characters that turn up in filenames and
 * content-disposition values. `encodeURIComponent` leaves `!'()*` alone; AWS
 * requires them encoded, and a request that disagrees with the server about one
 * character produces a signature mismatch and no hint as to which character.
 *
 * `encodeSlash` is false for a path (the separators stay separators) and true
 * for everything else. Getting that backwards turns an object key into a single
 * escaped blob and the bucket answers 404.
 */
export function uriEncode(value, encodeSlash = true) {
  let out = "";
  for (const byte of new TextEncoder().encode(value)) {
    const char = String.fromCharCode(byte);
    if (
      (byte >= 0x41 && byte <= 0x5a) || // A-Z
      (byte >= 0x61 && byte <= 0x7a) || // a-z
      (byte >= 0x30 && byte <= 0x39) || // 0-9
      char === "-" ||
      char === "_" ||
      char === "." ||
      char === "~"
    ) {
      out += char;
    } else if (char === "/" && !encodeSlash) {
      out += "/";
    } else {
      out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return out;
}

/** `20150830T123600Z` and `20150830` — the two forms every step needs. */
export function amzDates(now) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

export function credentialScope(dateStamp, region, service) {
  return `${dateStamp}/${region}/${service}/aws4_request`;
}

/**
 * The signing key: four chained HMACs, secret first, `aws4_request` last.
 *
 * Exported because it is the step worth testing on its own — if the vectors
 * disagree here, everything after it disagrees too and the canonical request is
 * an innocent bystander.
 */
export function signingKey(secretAccessKey, dateStamp, region, service) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const dateRegionKey = hmac(dateKey, region);
  const dateRegionServiceKey = hmac(dateRegionKey, service);
  return hmac(dateRegionServiceKey, "aws4_request");
}

/**
 * The canonical query string: every name and value encoded, then sorted.
 *
 * **Sorted after encoding, not before.** The two orders differ whenever a
 * character sorts differently from its `%XX` form, which is most punctuation.
 */
export function canonicalQuery(params) {
  return Object.entries(params)
    .map(([key, value]) => [uriEncode(key), uriEncode(value)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}


export function canonicalRequest(input) {
  const entries = Object.entries(input.headers)
    .map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/g, " ")])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));

  const canonicalHeaders = entries.map(([n, v]) => `${n}:${v}\n`).join("");
  const signedHeaders = entries.map(([n]) => n).join(";");

  const text = [
    input.method.toUpperCase(),
    uriEncode(input.path, false),
    canonicalQuery(input.query),
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");

  return { text, signedHeaders };
}

export function stringToSign(amzDate, scope, canonical) {
  return [ALGORITHM, amzDate, scope, sha256Hex(canonical)].join("\n");
}



/**
 * Signs a request and returns the headers to send with it.
 *
 * `host` and `x-amz-date` are added here rather than expected from the caller —
 * they are always required and always derivable, and a caller that forgets one
 * gets a mismatch rather than a message.
 */
export function signRequest(input) {
  const { amzDate, dateStamp } = amzDates(input.now);
  const scope = credentialScope(dateStamp, input.credentials.region, input.credentials.service);

  const headers = {
    ...input.headers,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": input.payloadHash,
  };

  const canonical = canonicalRequest({ ...input, headers });
  const key = signingKey(
    input.credentials.secretAccessKey,
    dateStamp,
    input.credentials.region,
    input.credentials.service,
  );
  const signature = Buffer.from(
    hmac(key, stringToSign(amzDate, scope, canonical.text)),
  ).toString("hex");

  return {
    signature,
    headers: {
      ...headers,
      Authorization:
        `${ALGORITHM} Credential=${input.credentials.accessKeyId}/${scope}, ` +
        `SignedHeaders=${canonical.signedHeaders}, Signature=${signature}`,
    },
  };
}


/**
 * A URL that carries its own authorisation and stops working on its own.
 *
 * This is how a private item reaches a browser without its bytes passing
 * through the app (AD-33): the server component decides access, mints one of
 * these, and the browser fetches from the bucket. A `<video>` seeking within
 * such a URL gets its byte ranges answered by the bucket, which is the whole
 * reason the app is not in the path.
 *
 * **The payload hash is the literal `UNSIGNED-PAYLOAD`.** Signing the hash of
 * an empty body instead is the mistake that reads as correct and produces a
 * mismatch on every request — the browser is not going to send the body we
 * imagined when we signed.
 */
export function presignUrl(input) {
  const { amzDate, dateStamp } = amzDates(input.now);
  const scope = credentialScope(dateStamp, input.credentials.region, input.credentials.service);
  const host = new URL(input.endpoint).host;

  const query = {
    ...(input.query ?? {}),
    "X-Amz-Algorithm": ALGORITHM,
    "X-Amz-Credential": `${input.credentials.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(input.expiresSeconds),
    "X-Amz-SignedHeaders": "host",
  };

  const canonical = canonicalRequest({
    method: input.method,
    path: input.path,
    query,
    headers: { host },
    payloadHash: UNSIGNED_PAYLOAD,
  });

  const key = signingKey(
    input.credentials.secretAccessKey,
    dateStamp,
    input.credentials.region,
    input.credentials.service,
  );
  const signature = Buffer.from(
    hmac(key, stringToSign(amzDate, scope, canonical.text)),
  ).toString("hex");

  return `${input.endpoint.replace(/\/$/, "")}${uriEncode(input.path, false)}?${canonicalQuery(
    query,
  )}&X-Amz-Signature=${signature}`;
}
