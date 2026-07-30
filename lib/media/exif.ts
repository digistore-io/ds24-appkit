// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Taking the metadata off an uploaded image.
//
// ── Why this is not a nicety ───────────────────────────────────────────────
// A photo taken on a phone carries the place it was taken, to a few metres, and
// the time. An app that lets a customer upload a picture and then serves it
// back — to them, to an operator, or on a page — is publishing that unless
// something removes it. It is personal data under any reading, it was never
// knowingly supplied, and nobody looking at the picture can tell it is there.
// `docs/data-protection.md` names this; this file is what makes the naming true.
//
// ── A segment walk, not a re-encode ────────────────────────────────────────
// The obvious implementation is "decode and write it out again", which needs an
// image library, changes every pixel of a JPEG on the way through, and would be
// the first runtime dependency added since the provider layer shipped five
// providers without one. Instead each format is a chain of labelled blocks, and
// the ones carrying metadata are dropped while the rest are copied byte for
// byte. The image that comes out is the image that went in, minus the blocks
// that were removed.
//
// ── What is kept, and why that is not an oversight ─────────────────────────
// **ICC colour profiles stay.** They live in APP2 for JPEG, and removing them
// would change how the picture looks — noticeably, on wide-gamut screens, in
// the direction of "washed out". A colour profile says how to interpret the
// pixels; it says nothing about where somebody was standing.
//
// ── The honest limit ───────────────────────────────────────────────────────
// **Video is not touched.** An MP4 can carry its recording location in a
// `©xyz` atom, and taking it out means walking the atom tree and rewriting the
// offsets that depend on it. Half of that is worse than none of it, because a
// half-stripped file reads as protected. So this file handles the three image
// formats and `docs/data-protection.md` says plainly that video metadata
// survives — which lets a vendor decide, rather than assume.

const JPEG_SOI = 0xd8;
const JPEG_SOS = 0xda;
const JPEG_EOI = 0xd9;

/**
 * JPEG segments that are dropped.
 *
 *   APP1  (0xE1) — Exif, and XMP. This is the one with the GPS in it.
 *   APP13 (0xED) — Photoshop image resource blocks, which carry IPTC. Author,
 *                  location and copyright fields live here in anything that has
 *                  been through a photo editor.
 *   COM   (0xFE) — the free-text comment. Editors write software names and
 *                  occasionally the original path on somebody's disk into it.
 *
 * APP0 (JFIF, density) and APP2 (ICC) are deliberately absent from this list.
 */
const JPEG_DROP = new Set([0xe1, 0xed, 0xfe]);

/**
 * PNG chunks that are dropped. All five are ancillary — a decoder that has
 * never heard of a chunk skips it, so removing them cannot produce a file a
 * reader chokes on.
 *
 * Each chunk carries its own CRC over its own bytes, so removing whole chunks
 * needs no checksum recomputed anywhere. That property is what makes this safe.
 */
const PNG_DROP = new Set(["eXIf", "tEXt", "iTXt", "zTXt", "tIME"]);

/** RIFF/WebP chunks that are dropped. Note the trailing space in `XMP ` — a
 * FourCC is always four bytes, and dropping the wrong four would remove pixels. */
const WEBP_DROP = new Set(["EXIF", "XMP "]);

function stripJpeg(bytes: Uint8Array): Uint8Array {
  // Not a JPEG after all — hand it back untouched rather than guessing.
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== JPEG_SOI) return bytes;

  const keep: Uint8Array[] = [bytes.subarray(0, 2)];
  let at = 2;

  while (at + 3 < bytes.length) {
    if (bytes[at] !== 0xff) break; // Not where a marker should be; stop cleanly.

    const marker = bytes[at + 1];

    // Standalone markers carry no length. Once the scan starts, the rest of the
    // file is entropy-coded data and must be copied verbatim — walking into it
    // looking for markers finds them by accident.
    if (marker === JPEG_SOS || marker === JPEG_EOI) break;

    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    if (length < 2 || at + 2 + length > bytes.length) break; // Malformed; stop.

    if (!JPEG_DROP.has(marker)) {
      keep.push(bytes.subarray(at, at + 2 + length));
    }
    at += 2 + length;
  }

  keep.push(bytes.subarray(at));
  return concat(keep);
}

function stripPng(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 8) return bytes;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const keep: Uint8Array[] = [bytes.subarray(0, 8)];
  let at = 8;

  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(
      bytes[at + 4],
      bytes[at + 5],
      bytes[at + 6],
      bytes[at + 7],
    );
    const total = 12 + length; // length + type + data + CRC
    if (at + total > bytes.length) break; // Malformed; keep what is left as is.

    if (!PNG_DROP.has(type)) {
      keep.push(bytes.subarray(at, at + total));
    }
    at += total;
    if (type === "IEND") break;
  }

  if (at < bytes.length) keep.push(bytes.subarray(at));
  return concat(keep);
}

function stripWebp(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 12) return bytes;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const body: Uint8Array[] = [bytes.subarray(8, 12)]; // the "WEBP" FourCC
  let at = 12;
  let dropped = false;

  while (at + 8 <= bytes.length) {
    const type = String.fromCharCode(
      bytes[at],
      bytes[at + 1],
      bytes[at + 2],
      bytes[at + 3],
    );
    const size = view.getUint32(at + 4, true); // RIFF sizes are little-endian
    // Chunks are padded to an even length, and the pad byte is not counted in
    // the size. Forgetting it walks the reader half a byte out of step and
    // every FourCC after it reads as garbage.
    const padded = size + (size % 2);
    const total = 8 + padded;
    if (at + total > bytes.length) break;

    if (WEBP_DROP.has(type)) {
      dropped = true;
    } else {
      body.push(bytes.subarray(at, at + total));
    }
    at += total;
  }

  if (!dropped) return bytes;

  const payload = concat(body);
  // The RIFF header's size field counts everything after it, so removing a
  // chunk means rewriting it. A file whose declared size no longer matches its
  // contents is one some decoders read and others reject.
  const out = new Uint8Array(8 + payload.length);
  out.set(bytes.subarray(0, 4)); // "RIFF"
  new DataView(out.buffer).setUint32(4, payload.length, true);
  out.set(payload, 8);
  return out;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/**
 * The image, without its metadata blocks.
 *
 * Anything that is not one of the three handled formats — including every
 * video, every recording and every PDF — comes back exactly as it went in. That
 * is the honest answer rather than a silent partial one, and the caller does not
 * branch on it: `manage.ts` runs every upload through here and the file decides
 * whether there is anything to do.
 */
export function stripMetadata(mime: string, bytes: Uint8Array): Uint8Array {
  switch (mime.trim().toLowerCase()) {
    case "image/jpeg":
      return stripJpeg(bytes);
    case "image/png":
      return stripPng(bytes);
    case "image/webp":
      return stripWebp(bytes);
    default:
      return bytes;
  }
}

/** Which media types this file actually does something to. For the docs and the check command. */
export const STRIPPED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
