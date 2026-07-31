// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Rows and bytes, kept in step.
//
// `store.ts` moves bytes and knows nothing about the database; `db/schema-media.ts`
// describes rows and knows nothing about a bucket. This file is the only place
// that holds both, which is why the two can never drift apart in one direction:
// an object with no row is invisible, and a row with no object is a broken
// image on somebody's page.
//
// ── The order of operations is the whole file ──────────────────────────────
// On the way in: bytes first, row second. A crash between them leaves an
// orphaned object, which costs storage and shows nobody anything.
// On the way out: object first, row second. A crash between them leaves a row
// pointing at nothing, which is visible and fixable. The reverse — row gone,
// object still in the bucket — is a deletion request that was not honoured, and
// nothing afterwards can find it to finish the job.
//
// ── Where it may be read ───────────────────────────────────────────────────
// Server components, Server Actions, route handlers, scripts. Never a client
// component.
import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { media, type MediaRow } from "@/db/schema-media";
import { hasPlan } from "@/lib/entitlements/manage";

import { mediaConfig, planProblem } from "./config";
import { stripMetadata } from "./exif";
import {
  MediaError,
  kindForMime,
  needsAlt,
  refuseUpload,
  safeFilename,
  storageKey,
  extensionFor,
  type MediaSource,
  type MediaVisibility,
} from "./rules";
import { agreedMime } from "./sniff";
import { mediaStore } from "./store";

export interface AcceptUploadInput {
  /** The uploader. Their own id, from the session — never from a form. */
  ownerId: string;
  /** Their `users.role`, which decides what they may put in. */
  role: string;
  bytes: Uint8Array;
  /** What the request said it was. Used to notice a disagreement, never trusted. */
  claimedMime: string | null;
  filename: string | null;
  visibility?: MediaVisibility;
  /** Required when `visibility` is `entitled`. */
  requiresPlan?: string | null;
  alt?: string | null;
}

/**
 * Take an upload in, or refuse it.
 *
 * The order of the checks is the same one `app/api/chat/route.ts` uses and it
 * is not arbitrary — each refusal happens before anything more expensive than
 * itself, and the message a caller gets names the actual problem rather than
 * the first symptom of it.
 */
export async function acceptUpload(input: AcceptUploadInput): Promise<MediaRow> {
  const config = mediaConfig();

  if (input.bytes.length === 0) throw new MediaError("noFile");

  // What it IS, from its bytes. A `Content-Type` in a multipart part is written
  // by whoever sent the request, so believing it means an installation that
  // accepts `image/png` accepts anything at all.
  const mime = agreedMime(input.bytes, input.claimedMime);
  if (!mime) {
    // Two different situations, and telling them apart is worth a branch: bytes
    // we do not recognise at all, versus bytes that recognisably contradict
    // what the request claimed.
    throw new MediaError(input.claimedMime ? "typeMismatch" : "typeNotAllowed");
  }

  const refusal = refuseUpload(config, {
    role: input.role,
    mime,
    bytes: input.bytes.length,
  });
  if (refusal) throw new MediaError(refusal);

  const kind = kindForMime(config, mime);
  if (!kind) throw new MediaError("typeNotAllowed");

  const alt = input.alt?.trim() || null;
  if (needsAlt(kind) && !alt) throw new MediaError("altRequired");

  const visibility: MediaVisibility = input.visibility ?? "owner";
  const requiresPlan = visibility === "entitled" ? (input.requiresPlan?.trim() ?? null) : null;
  if (visibility === "entitled") {
    if (!requiresPlan) {
      throw new MediaError(
        "noAccess",
        'visibility "entitled" needs a Product Key — otherwise nobody could ever fetch it',
      );
    }
    // `hasPlan()` throws on an unknown key, so an unchecked one would not mean
    // "no access", it would take down the page that renders the item.
    const problem = planProblem(requiresPlan);
    if (problem) throw new MediaError("noAccess", `requiresPlan: ${problem}`);
  }

  // GPS and camera data off, before anything is written anywhere. Images only —
  // video keeps its metadata and `docs/data-protection.md` says so rather than
  // implying a protection that is not there.
  const stored = stripMetadata(mime, input.bytes);

  return createMedia({
    ownerId: input.ownerId,
    kind,
    mime,
    bytes: stored,
    filename: input.filename ? safeFilename(input.filename, extensionFor(mime)) : null,
    visibility,
    requiresPlan,
    alt,
    source: "upload",
  });
}

export interface CreateMediaInput {
  ownerId: string | null;
  kind: NonNullable<ReturnType<typeof kindForMime>>;
  mime: string;
  bytes: Uint8Array;
  filename: string | null;
  visibility: MediaVisibility;
  requiresPlan: string | null;
  alt: string | null;
  source: MediaSource;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  prompt?: string | null;
  provider?: string | null;
  model?: string | null;
}

/**
 * Put bytes away and write the row that describes them.
 *
 * The id is minted here rather than by the database, because the storage key is
 * derived from it and the object has to be written before the row exists — see
 * the ordering note at the top of the file.
 */
export async function createMedia(input: CreateMediaInput): Promise<MediaRow> {
  // ── Validated HERE, not only in the callers above ────────────────────────
  // A code review found that `acceptUpload()` and `generateImage()` checked the
  // key and this function did not — while `docs/visuals.md` → *Selling a file*
  // tells a vendor to call THIS function directly with `visibility: "entitled"`.
  // So the one documented way to sell a file had no check at all, and
  // `hasPlan()` throws on an unknown key: a typo took the page down instead of
  // denying access, which is exactly what AD-41 exists to prevent.
  if (input.visibility === "entitled") {
    if (!input.requiresPlan) {
      throw new MediaError(
        "noAccess",
        'visibility "entitled" needs a Product Key — otherwise nobody could ever fetch it',
      );
    }
    const problem = planProblem(input.requiresPlan);
    if (problem) throw new MediaError("noAccess", `requiresPlan: ${problem}`);
  }

  const id = crypto.randomUUID();
  const createdAt = new Date();
  const key = storageKey({ id, kind: input.kind, mime: input.mime, createdAt });

  await mediaStore().put(key, input.bytes, input.mime);

  try {
    const [row] = await db
      .insert(media)
      .values({
        id,
        ownerId: input.ownerId,
        kind: input.kind,
        visibility: input.visibility,
        requiresPlan: input.requiresPlan,
        storageKey: key,
        mime: input.mime,
        filename: input.filename,
        bytes: input.bytes.length,
        width: input.width ?? null,
        height: input.height ?? null,
        durationSeconds: input.durationSeconds ?? null,
        sha256: createHash("sha256").update(input.bytes).digest("hex"),
        source: input.source,
        alt: input.alt,
        prompt: input.prompt ?? null,
        provider: input.provider ?? null,
        model: input.model ?? null,
        createdAt,
      })
      .returning();
    return row;
  } catch (error) {
    // The row did not happen, so nothing will ever reference this object. Take
    // it back out rather than leaving somebody's file in a bucket with no
    // record that it is there — which is the shape of thing a data-protection
    // audit finds and nobody can explain.
    await mediaStore()
      .remove(key)
      .catch(() => {});
    throw error;
  }
}

export async function findMedia(id: string): Promise<MediaRow | null> {
  const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  return row ?? null;
}

export interface Viewer {
  memberId: string | null;
  role: string | null;
}

/**
 * May this viewer have this item?
 *
 * The three visibilities, and one asymmetry worth stating rather than leaving
 * to be discovered: an **operator may fetch `entitled` content but not
 * `owner` content.** Entitled items are the product — the operator uploaded
 * them and sells them. An `owner` item is a customer's own file, and an
 * operator who wants to see what a customer sees has `impersonation` for that,
 * which is recorded. Reading a customer's uploads straight out of an admin
 * session would be the same capability without the record.
 *
 * During an impersonation `session.user.role` is `member`, so this function
 * treats an impersonating operator exactly as the member — which is the
 * behaviour AD-23 gives every other guard in the app for free.
 */
export async function mayAccess(row: MediaRow, viewer: Viewer): Promise<boolean> {
  if (row.visibility === "public") return true;
  if (!viewer.memberId) return false;

  if (row.visibility === "owner") {
    return row.ownerId === viewer.memberId;
  }

  // entitled
  if (viewer.role === "owner") return true;
  if (!row.requiresPlan) return false;

  // Write-time validation cannot cover a LATER edit. Retiring a product from
  // `config/digistore-products.json` is an ordinary thing to do and nothing
  // warns about the media rows pointing at it — and `hasPlan()` throws on a key
  // it does not know, so without this the delivery route and every server
  // component rendering the item answer 500 rather than refusing access.
  // Refusing is the right answer: a plan that no longer exists is a plan nobody
  // holds.
  if (planProblem(row.requiresPlan)) {
    console.error(
      `[media] ${row.id}: requiresPlan "${row.requiresPlan}" is no longer a product — ` +
        `access refused. Fix the row or restore the product.`,
    );
    return false;
  }

  return hasPlan(viewer.memberId, row.requiresPlan);
}

/**
 * Remove an item: the object first, then the row.
 *
 * A failure to remove the object stops the whole thing, deliberately. The
 * alternative — dropping the row anyway — loses the only pointer to a file
 * somebody asked to have deleted, and no later run can find it.
 */
export async function deleteMedia(id: string): Promise<void> {
  const row = await findMedia(id);
  if (!row) return;
  await mediaStore().remove(row.storageKey);
  await db.delete(media).where(eq(media.id, id));
}

/**
 * Everything a member owns. Used by the export and by account deletion.
 *
 * `owner`-visible items only: what the member uploaded for themselves. An
 * operator's product imagery has `ownerId` set to whoever uploaded it too, and
 * that is deliberately NOT swept up here — deleting the operator's account must
 * not take the app's lesson covers with it, which is why the foreign key is
 * `set null` rather than `cascade`.
 */
export async function listOwnedMedia(memberId: string): Promise<MediaRow[]> {
  return db
    .select()
    .from(media)
    .where(and(eq(media.ownerId, memberId), eq(media.visibility, "owner")));
}

/**
 * Delete every item a member owns, objects included.
 *
 * Called from account deletion. A Postgres cascade would remove rows and leave
 * every object in the bucket — the files would still be there, and the customer
 * would have been told they were gone.
 */
export async function deleteOwnedMedia(memberId: string): Promise<number> {
  const rows = await listOwnedMedia(memberId);
  for (const row of rows) {
    await mediaStore().remove(row.storageKey);
    await db.delete(media).where(eq(media.id, row.id));
  }
  return rows.length;
}
