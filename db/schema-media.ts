// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// One row per stored item — a picture, a video, a recording, or the file a
// buyer paid for.
//
// ── The bytes are not in here ──────────────────────────────────────────────
// This table describes objects; the objects live in the bucket
// (`lib/media/store.ts`). The two are kept together by `lib/media/manage.ts`,
// and the one place that matters most is deletion: a `cascade` removes the row
// and does not touch the bucket, so `deleteMedia()` removes the object first.
// A bucket full of objects nobody has a row for is a deletion request that was
// not honoured — see `docs/data-protection.md`.
//
// ── Four kinds, from the first migration ───────────────────────────────────
// Not "images, and we will see". Delivery, the size ceiling and the byte
// signature all differ per kind, and an app that needs a PDF two weeks after
// launch would otherwise get a second table beside this one, with its own
// access rules and its own mistakes.
//
// ── Three visibilities, and the third is the commercial one ────────────────
// `public` is product imagery, `owner` is what a customer uploaded, and
// `entitled` is the file somebody bought. That last one is why a Content-Access
// app can sell a PDF at all, and its check is `hasPlan()` — the same call the
// rest of the app makes. `requiresPlan` is validated against the product
// registry when it is written (`lib/media/config.ts` → `planProblem()`),
// because `hasPlan()` THROWS on an unknown key: an unchecked value would not
// mean "no access", it would mean the page is a 500.
import { pgTable, text, timestamp, integer, index, pgEnum } from "drizzle-orm/pg-core";
import { users } from "./schema";

export const mediaKindEnum = pgEnum("media_kind", ["image", "video", "audio", "file"]);

export const mediaVisibilityEnum = pgEnum("media_visibility", [
  "public",
  "owner",
  "entitled",
]);

export const mediaSourceEnum = pgEnum("media_source", ["upload", "generated"]);

export const media = pgTable(
  "media",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Who put it there. NULL for something that belongs to the product rather
    // than to a person — a lesson cover outlives the operator account that
    // uploaded it. `set null` rather than `cascade` for exactly that reason:
    // deleting an account must not take the product's own images with it. What
    // a customer uploaded is `owner`-visible and goes with them, and
    // `lib/privacy/export.ts` is where that split is enforced.
    ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),

    kind: mediaKindEnum("kind").notNull(),
    visibility: mediaVisibilityEnum("visibility").notNull().default("owner"),

    // The plan somebody must hold, for `visibility: "entitled"`. A Product Key
    // from config/digistore-products.json — never a token package.
    requiresPlan: text("requires_plan"),

    // Where it sits in the bucket. Derived (`lib/media/rules.ts` →
    // `storageKey()`), never supplied by a request.
    storageKey: text("storage_key").notNull().unique(),

    // What it IS, read from its bytes at upload (`lib/media/sniff.ts`) — not
    // what the request claimed. This is the value the browser is later told,
    // and `X-Content-Type-Options: nosniff` means the browser will not rescue
    // a wrong one by guessing.
    mime: text("mime").notNull(),

    // The name it was uploaded under, for the download to carry. Personal data
    // in the mild sense that a customer chose it, so it is in the export.
    // Never part of the storage key: a name a customer typed must not shape
    // where anything is written.
    filename: text("filename"),

    bytes: integer("bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    durationSeconds: integer("duration_seconds"),

    // SHA-256 of the stored bytes. Not a security control — it is how "is this
    // the same file again?" gets an answer without fetching the object.
    sha256: text("sha256").notNull(),

    source: mediaSourceEnum("source").notNull().default("upload"),

    // Alternative text. Mandatory for images and meaningless for the rest —
    // `components/ui/figure.tsx` makes its absence a compile error on the path
    // that matters, and `lib/media/rules.ts` → `needsAlt()` is the same rule
    // for the upload endpoint and the generator.
    alt: text("alt"),

    // Only for `source: "generated"`: what was asked for, and who answered.
    // The cost is NOT here — it is in `ai_usage`, with every other model call,
    // so `/dashboard/admin/ai-costs` needs nothing new written for it.
    prompt: text("prompt"),
    provider: text("provider"),
    model: text("model"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // "this member's items, newest first" — the gallery and the export.
    index("media_owner").on(t.ownerId, t.createdAt),
    // "everything behind this plan" — the operator's view of what a plan buys.
    index("media_requires_plan").on(t.requiresPlan),
  ],
);

export type MediaRow = typeof media.$inferSelect;
