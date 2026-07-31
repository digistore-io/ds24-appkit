// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The media rules — pure functions, no I/O, no database, no environment.
//
// Everything in this file answers a question that has one right answer given
// its inputs: which kind is this media type, is this size within the ceiling,
// may THIS role upload THAT type, what key does this item get in the bucket.
// The shells that do the work — `store.ts`, `manage.ts`, the routes — call in
// here rather than deciding for themselves, for the same reason
// `lib/tokens/rules.ts` and `lib/users/rules.ts` exist: a rule inside a route
// handler is a rule that gets a second, slightly different copy in the next
// route handler.
//
// ── Where it may be read ───────────────────────────────────────────────────
// Anywhere. This file imports nothing of the app and reads no configuration —
// the configuration is handed IN. That is what lets a client component use
// `formatBytes()` and a route handler use `refuseUpload()` from the same file.

/**
 * The four kinds of media an app puts in front of a customer.
 *
 * Written out rather than derived, for the same reason `PROVIDER_IDS` is: a
 * plain array cannot produce a union type, and the union is what stops a
 * typo'd kind reaching the database.
 *
 * A fifth kind is an entry in three tables — this list, the size ceilings in
 * `config/media.json`, and the signature table in `sniff.ts` — and nothing
 * else. That is the whole point of having kinds at all rather than a boolean
 * called `isImage`.
 */
export const MEDIA_KINDS = ["image", "video", "audio", "file"] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];

export function isMediaKind(value: unknown): value is MediaKind {
  return (MEDIA_KINDS as readonly unknown[]).includes(value);
}

/**
 * Who may fetch an item.
 *
 * The three shapes are not a permission system and must not grow into one:
 *
 *   public    belongs to the PRODUCT — a lesson cover, the hero image of a
 *             generated sales page. The object is readable in the bucket and
 *             no request for its bytes ever reaches this app.
 *   owner     belongs to a PERSON — the photo a customer uploaded. Whoever
 *             uploaded it, and nobody else.
 *   entitled  belongs to the product but was PAID FOR — the PDF or the
 *             software a buyer gets. `hasPlan()` decides, which is the same
 *             call the rest of the app already makes.
 *
 * A fourth shape is almost always one of these three with a different question
 * attached; ask whether `entitled` with another Product Key would do it.
 */
export const MEDIA_VISIBILITIES = ["public", "owner", "entitled"] as const;

export type MediaVisibility = (typeof MEDIA_VISIBILITIES)[number];

export function isMediaVisibility(value: unknown): value is MediaVisibility {
  return (MEDIA_VISIBILITIES as readonly unknown[]).includes(value);
}

/** Where the bytes came from. */
export const MEDIA_SOURCES = ["upload", "generated"] as const;

export type MediaSource = (typeof MEDIA_SOURCES)[number];

/**
 * Every way a media operation can be refused, as a code.
 *
 * A code and not a sentence — the same deal `lib/users/rules.ts` and
 * `lib/tokens/rules.ts` make (AD-10). This module has no language; the route
 * or the Server Action translates. `i18n/messages.test.ts` fails the build if
 * one of these has no text in both `messages/de.json` and `messages/en.json`.
 */
export const MEDIA_ERROR_CODES = [
  /** No session, or a blocked account. */
  "notSignedIn",
  /** Too many uploads in the window. */
  "rateLimited",
  /** Nothing in the request. */
  "noFile",
  /** Over the ceiling for its kind. The message names the ceiling. */
  "tooLarge",
  /** The bytes are not a media type this installation accepts at all. */
  "typeNotAllowed",
  /**
   * The right kind of file, but a broken copy of one.
   *
   * Distinct from `typeNotAllowed` because the two send a person in opposite
   * directions. A JPEG truncated by a flaky mobile connection used to be
   * refused with "this kind of file is not accepted here", which is untrue —
   * JPEGs are accepted — and sends them off to convert a format that was never
   * the problem, when the fix is to send it again.
   */
  "fileDamaged",
  /** The bytes disagree with what the request claimed they were. */
  "typeMismatch",
  /** A real media type, but not one this role may upload. */
  "notAllowedForRole",
  /** The item does not exist, or the caller may not know that it does. */
  "notFound",
  /** It exists and the caller may not have it. */
  "noAccess",
  /** The store is misconfigured or unreachable. */
  "storeUnavailable",
  /** An image was offered with no alternative text. */
  "altRequired",
] as const;

export type MediaErrorCode = (typeof MEDIA_ERROR_CODES)[number];

export class MediaError extends Error {
  readonly code: MediaErrorCode;

  constructor(code: MediaErrorCode, message?: string) {
    super(message ?? code);
    this.name = "MediaError";
    this.code = code;
  }
}

/** What one kind may be and how big it may get. */
export interface KindRule {
  maxBytes: number;
  mimeTypes: readonly string[];
  /**
   * How long a minted address for a private item stays valid, in seconds.
   *
   * Per kind, deliberately, and this is a real trade rather than a knob. Sixty
   * seconds is plenty for an image and takes a forty-minute video down the
   * moment the player re-requests a later byte range. Longer means the address
   * can be passed to somebody else for that long — for paid content that is an
   * accepted cost, and `docs/visuals.md` says so rather than leaving a vendor
   * to discover it.
   */
  signedUrlSeconds: number;
}

/** The whole media configuration, after `config.ts` has read and defaulted it. */
export interface MediaRules {
  kinds: Record<MediaKind, KindRule>;
  /** Which media types each role may put in. Keyed by `users.role`. */
  mayUpload: Record<string, readonly string[]>;
}

/** Which kind a media type belongs to, or null if this installation takes none. */
export function kindForMime(rules: MediaRules, mime: string): MediaKind | null {
  const wanted = mime.trim().toLowerCase();
  for (const kind of MEDIA_KINDS) {
    if (rules.kinds[kind].mimeTypes.includes(wanted)) return kind;
  }
  return null;
}

/**
 * May this role upload this media type, and is the size within its ceiling?
 *
 * Returns a code or null. Null means yes.
 *
 * The order matters and is not cosmetic: an unknown type is refused before its
 * size is considered, because "10 MB is too large" is a confusing answer to
 * somebody who uploaded a file format the app never accepts. And the role check
 * comes before the size check for the same reason.
 */
export function refuseUpload(
  rules: MediaRules,
  input: { role: string; mime: string; bytes: number },
): MediaErrorCode | null {
  const kind = kindForMime(rules, input.mime);
  if (!kind) return "typeNotAllowed";

  const allowed = rules.mayUpload[input.role] ?? [];
  if (!allowed.includes(input.mime.trim().toLowerCase())) return "notAllowedForRole";

  if (input.bytes <= 0) return "noFile";
  if (input.bytes > rules.kinds[kind].maxBytes) return "tooLarge";

  return null;
}

/**
 * Does an item of this kind need alternative text?
 *
 * Images do and nothing else does. A PDF has no alternative text, a recording
 * has none, and demanding one would produce the thing accessibility rules exist
 * to prevent: a field filled in with "file" to get past a validator.
 *
 * The guarantee that an image cannot reach a page without one lives in the TYPE
 * of `components/ui/figure.tsx`, not here — a compile error beats a runtime
 * refusal. This function is the same rule for the paths a type cannot reach:
 * the upload endpoint and the generator.
 */
export function needsAlt(kind: MediaKind): boolean {
  return kind === "image";
}

/**
 * The file extension for a media type — used only to make a stored object
 * recognisable to a human browsing the bucket.
 *
 * Never used to decide anything. What a thing IS comes from its bytes
 * (`sniff.ts`); an extension is a label somebody typed.
 */
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "application/pdf": "pdf",
  "application/zip": "zip",
};

export function extensionFor(mime: string): string {
  return EXTENSIONS[mime.trim().toLowerCase()] ?? "bin";
}

/**
 * The key an item gets in the bucket.
 *
 * **Derived, never supplied.** This is the single most important line in the
 * file. A key taken from a request is a path traversal (`../../`), a collision
 * with somebody else's object, or an overwrite of one — and the request that
 * does it looks exactly like an ordinary upload. So the key is built from the
 * row's own id, which this app generated, and nothing a caller sent.
 *
 * The date folders are for humans: a bucket with fifty thousand objects in one
 * prefix is one nobody can look at, and "which of these arrived in March" is the
 * question somebody actually asks. They are not read by any code.
 *
 * The original filename is NOT in the key. It travels in the row and is applied
 * at download time through `response-content-disposition`, so a customer named
 * file cannot shape the storage layout.
 */
export function storageKey(input: {
  id: string;
  kind: MediaKind;
  mime: string;
  createdAt: Date;
}): string {
  const year = input.createdAt.getUTCFullYear();
  const month = String(input.createdAt.getUTCMonth() + 1).padStart(2, "0");
  return `${input.kind}/${year}/${month}/${input.id}.${extensionFor(input.mime)}`;
}

/**
 * A filename safe to put in a `Content-Disposition` header.
 *
 * A header value carrying a quote or a newline is a header injection, and the
 * name here came from whoever uploaded the file. Everything outside a narrow
 * set becomes an underscore, and an empty result gets a name rather than none —
 * a download called `""` saves as the URL's last segment, which is the storage
 * key this function exists to keep out of sight.
 */
export function safeFilename(name: string, fallbackExt: string): string {
  const cleaned = name
    .replace(/[\r\n"\\]/g, "")
    .replace(/[^A-Za-z0-9._ ()-]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned === "" || cleaned === "." || cleaned === "..") {
    return `download.${fallbackExt}`;
  }
  if (cleaned.length <= MAX_FILENAME) return cleaned;

  // **Shorten the stem, keep the extension.** A blunt slice cut the extension
  // off the end, and a download called `aaaa…` with no `.pdf` does not open —
  // which is a worse outcome than a long name.
  // `dot < cleaned.length - 1` is what makes a TRAILING dot not count as an
  // extension. Without it a name ending in one satisfied `hasExt`, `ext` became
  // `"."`, and the result was 120 characters ending in a bare dot with the
  // fallback never applied — the exact outcome this branch exists to prevent,
  // reached by the branch itself. It is not a contrived input: the sanitiser
  // above strips quotes, so an ordinary `…report."` arrives here as `…report.`.
  const dot = cleaned.lastIndexOf(".");
  const hasExt = dot > 0 && dot < cleaned.length - 1 && cleaned.length - dot <= 12;
  const ext = hasExt ? cleaned.slice(dot) : `.${fallbackExt}`;
  return cleaned.slice(0, Math.max(1, MAX_FILENAME - ext.length)) + ext;
}

/** Long enough for any real filename, short enough for any filesystem. */
const MAX_FILENAME = 120;

/** "2,4 MB" — for the ceiling in a refusal and for the download presentation. */
export function formatBytes(bytes: number, locale = "en"): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
  return `${formatted} ${units[unit]}`;
}
