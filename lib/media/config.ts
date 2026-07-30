// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// `config/media.json`, read once and defaulted field by field.
//
// The same five-part shape as `lib/mcp/config.ts` and `lib/ai/chat-config.ts`:
// a typed interface, a default that is safe, coercion helpers, one reader, and
// a `…Problems()` function a test fails the build on. Read it through
// `mediaConfig()` and never by importing the JSON somewhere else — a second
// reader is a second set of defaults, and they drift.
//
// ── Which way it fails ─────────────────────────────────────────────────────
// A malformed ceiling falls back to the default rather than to infinity, and a
// malformed type list falls back to the default rather than to "everything".
// Both directions matter and they are not symmetrical: an unreadable config
// that accepted every media type would be an upload endpoint that takes
// arbitrary executables, which is a worse outcome than one that takes nothing.
//
// ── Where it may be read ───────────────────────────────────────────────────
// Server components, Server Actions, route handlers, and the check command.
// NOT a client component: it imports the product registry to validate a Product
// Key, and Digistore24 ids and prices have no business in a browser bundle —
// the same rule `lib/billing-mode.ts` and `lib/ai/chat-config.ts` follow.
import raw from "@/config/media.json";
import { allProducts } from "@/lib/digistore/products";

import {
  MEDIA_KINDS,
  type KindRule,
  type MediaKind,
  type MediaRules,
} from "./rules";

export interface MediaConfig extends MediaRules {
  enabled: boolean;
  maxUploadsPerHour: number;
}

/**
 * The defaults.
 *
 * Chosen to be usable rather than minimal — an installation that never opens
 * this file still gets an app where a customer can attach a photo and a vendor
 * can sell a PDF. The ceilings are what fits comfortably through a route
 * handler on every host in `docs/DEPLOY.md`.
 */
export const DEFAULT_MEDIA_CONFIG: MediaConfig = {
  enabled: true,
  maxUploadsPerHour: 30,
  kinds: {
    image: {
      maxBytes: 10 * 1024 * 1024,
      mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
      signedUrlSeconds: 300,
    },
    video: {
      maxBytes: 50 * 1024 * 1024,
      mimeTypes: ["video/mp4", "video/webm"],
      signedUrlSeconds: 6 * 60 * 60,
    },
    audio: {
      maxBytes: 50 * 1024 * 1024,
      mimeTypes: ["audio/mpeg", "audio/ogg", "audio/wav"],
      signedUrlSeconds: 6 * 60 * 60,
    },
    file: {
      maxBytes: 50 * 1024 * 1024,
      mimeTypes: ["application/pdf", "application/zip"],
      signedUrlSeconds: 300,
    },
  },
  mayUpload: {
    member: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    owner: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/webm",
      "audio/mpeg",
      "audio/ogg",
      "audio/wav",
      "application/pdf",
      "application/zip",
    ],
  },
};

/**
 * A bounded number.
 *
 * The upper bound is not decoration. `maxBytes` of a gigabyte is not a
 * configuration, it is a route handler that runs the process out of memory on
 * one request — the bytes are buffered to be checked and stripped. Whoever
 * genuinely needs that needs the direct-to-bucket path instead.
 */
function count(value: unknown, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
}

/** A list of media types, lowercased. Anything that is not a clean list of strings falls back. */
function mimeList(value: unknown, fallback: readonly string[]): readonly string[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .map((item) => item.trim().toLowerCase());
  return cleaned.length > 0 ? cleaned : fallback;
}

const MAX_BYTES_CEILING = 200 * 1024 * 1024;

export function mediaConfig(): MediaConfig {
  const file = raw as Record<string, unknown>;
  const kindsRaw = (file.kinds ?? {}) as Record<string, unknown>;
  const mayUploadRaw = (file.mayUpload ?? {}) as Record<string, unknown>;

  const kinds = Object.fromEntries(
    MEDIA_KINDS.map((kind) => {
      const fallback = DEFAULT_MEDIA_CONFIG.kinds[kind];
      const entry = (kindsRaw[kind] ?? {}) as Record<string, unknown>;
      const rule: KindRule = {
        maxBytes: count(entry.maxBytes, fallback.maxBytes, MAX_BYTES_CEILING),
        mimeTypes: mimeList(entry.mimeTypes, fallback.mimeTypes),
        // A day is the ceiling. Beyond that an address is not "short-lived" in
        // any sense a vendor would recognise, and the honest answer for content
        // that must not be passed on is a shorter one, not a longer one.
        signedUrlSeconds: count(entry.signedUrlSeconds, fallback.signedUrlSeconds, 86400),
      };
      return [kind, rule];
    }),
  ) as Record<MediaKind, KindRule>;

  const mayUpload: Record<string, readonly string[]> = {};
  for (const [role, list] of Object.entries(mayUploadRaw)) {
    // `_comment` keys are documentation and are not roles.
    if (role.startsWith("_")) continue;
    mayUpload[role] = mimeList(list, DEFAULT_MEDIA_CONFIG.mayUpload[role] ?? []);
  }
  if (Object.keys(mayUpload).length === 0) {
    Object.assign(mayUpload, DEFAULT_MEDIA_CONFIG.mayUpload);
  }

  return {
    enabled: file.enabled !== false,
    maxUploadsPerHour: count(
      file.maxUploadsPerHour,
      DEFAULT_MEDIA_CONFIG.maxUploadsPerHour,
      1000,
    ),
    kinds,
    mayUpload,
  };
}

/**
 * Everything wrong with the shipped config — empty when it is coherent.
 *
 * `config.test.ts` fails the build on a non-empty result, which is the point:
 * a role allowed to upload a media type that belongs to no kind would be a rule
 * that can never be satisfied, and it should be found here rather than by a
 * customer whose upload is refused with a code that makes no sense.
 */
export function mediaConfigProblems(): string[] {
  const config = mediaConfig();
  const problems: string[] = [];

  const known = new Set(MEDIA_KINDS.flatMap((kind) => config.kinds[kind].mimeTypes));

  for (const [role, allowed] of Object.entries(config.mayUpload)) {
    for (const mime of allowed) {
      if (!known.has(mime)) {
        problems.push(
          `"mayUpload.${role}": "${mime}" belongs to no kind — add it to one of ` +
            `${MEDIA_KINDS.join(", ")} in config/media.json, or remove it here`,
        );
      }
    }
  }

  // An SVG is a document that can carry script. Serving one a customer uploaded
  // is handing every later visitor code somebody else wrote. The refusal is
  // here rather than in the sniffer because it is a decision about the product,
  // and somebody who genuinely wants it should have to read this sentence.
  for (const kind of MEDIA_KINDS) {
    if (config.kinds[kind].mimeTypes.includes("image/svg+xml")) {
      problems.push(
        `"kinds.${kind}": SVG is not accepted. An SVG can carry script, and a ` +
          `file one customer uploaded would then run in another customer's browser`,
      );
    }
  }

  return problems;
}

/**
 * Is a Product Key on a media row usable?
 *
 * Called wherever an `entitled` item is written — the endpoint, a seed, a
 * script. **`hasPlan()` throws on an unknown Product Key**, so an unchecked key
 * does not mean "no access", it means the page that renders the item is a 500.
 * That is the trap this function exists for, and it is the same refusal
 * `mcpConfigProblems()` makes for the same reason.
 */
export function planProblem(productKey: string): string | null {
  const plan = allProducts().find((p) => p.key === productKey);
  if (!plan) {
    return `no product "${productKey}" in config/digistore-products.json`;
  }
  if (plan.kind === "token") {
    return (
      `"${productKey}" is a token package — a balance is not an entitlement, ` +
      `so hasPlan() answers false for it for ever and nobody would ever get the file`
    );
  }
  return null;
}

/** Is media available on this installation at all? */
export function isMediaEnabled(): boolean {
  return mediaConfig().enabled && mediaConfigProblems().length === 0;
}
