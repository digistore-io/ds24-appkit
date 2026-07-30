// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// What a file actually IS, read from its first bytes.
//
// ── Why this exists at all ─────────────────────────────────────────────────
// A multipart upload carries a `Content-Type` per part, and it is written by
// whoever sent the request. Believing it means an installation that accepts
// `image/png` accepts anything at all, as long as the sender says `image/png` —
// which is not a subtle attack, it is the first thing anybody tries.
//
// `next.config.ts` sets `X-Content-Type-Options: nosniff` on every response, so
// the browser will NOT rescue a wrong answer by guessing. That cuts both ways
// and is why this file matters twice: the type we record is the type the
// browser is told, and if it is wrong the file simply does not render.
//
// ── Why a table and not a library ──────────────────────────────────────────
// The formats this template accepts are a closed list — an installation that
// wants a fifth adds a row here and a media type to `config/media.json`. A
// dependency for a dozen byte comparisons would be the first runtime
// dependency added since the provider layer shipped five providers without one.
//
// ── What this file deliberately does NOT do ────────────────────────────────
// It does not validate that a file is well-formed. A truncated JPEG has a JPEG
// signature and is still a JPEG as far as this app is concerned — deciding
// otherwise means decoding, which means an image library. What it guarantees is
// narrower and is the thing that matters: the bytes are of the type we are
// about to record, and therefore of the type the browser will later be told.

/** How many leading bytes `sniffMime()` needs. Cheap, and the same for all. */
export const SNIFF_BYTES = 16;

interface Signature {
  mime: string;
  /** Byte values at `offset`; `null` means "any byte here". */
  magic: readonly (number | null)[];
  offset: number;
  /** A second run of bytes that must also match, for container formats. */
  also?: { offset: number; magic: readonly number[] };
}

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));

/**
 * The signatures, most specific first.
 *
 * Order matters for the RIFF family: `RIFF....WEBP` and `RIFF....WAVE` share
 * their first four bytes, so both carry an `also` clause and neither may be
 * written as a bare four-byte match.
 */
const SIGNATURES: readonly Signature[] = [
  // ── images ───────────────────────────────────────────────────────────────
  { mime: "image/jpeg", offset: 0, magic: [0xff, 0xd8, 0xff] },
  {
    mime: "image/png",
    offset: 0,
    magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  {
    mime: "image/webp",
    offset: 0,
    magic: ascii("RIFF"),
    also: { offset: 8, magic: ascii("WEBP") },
  },
  { mime: "image/gif", offset: 0, magic: ascii("GIF87a") },
  { mime: "image/gif", offset: 0, magic: ascii("GIF89a") },

  // ── video ────────────────────────────────────────────────────────────────
  // MP4 and its relatives declare themselves four bytes in, after a length.
  // The brand that follows (`isom`, `mp42`, `M4V `…) is deliberately not
  // checked: there are dozens, they are added over time, and `ftyp` at offset
  // four is the part that identifies the container.
  { mime: "video/mp4", offset: 4, magic: ascii("ftyp") },
  // Matroska and WebM share the EBML header. WebM is the one browsers play, and
  // telling them apart means parsing the DocType element — an installation that
  // needs Matroska adds it to `config/media.json` and gets `video/webm` here,
  // which is honest about what this table can and cannot distinguish.
  { mime: "video/webm", offset: 0, magic: [0x1a, 0x45, 0xdf, 0xa3] },

  // ── audio ────────────────────────────────────────────────────────────────
  { mime: "audio/mpeg", offset: 0, magic: ascii("ID3") },
  // An MP3 with no ID3 tag starts on a frame sync: eleven set bits. The second
  // byte therefore varies in its low nibble, which is why the table allows a
  // masked comparison rather than only exact bytes.
  { mime: "audio/mpeg", offset: 0, magic: [0xff, null] },
  { mime: "audio/ogg", offset: 0, magic: ascii("OggS") },
  {
    mime: "audio/wav",
    offset: 0,
    magic: ascii("RIFF"),
    also: { offset: 8, magic: ascii("WAVE") },
  },

  // ── files ────────────────────────────────────────────────────────────────
  { mime: "application/pdf", offset: 0, magic: ascii("%PDF-") },
  // Three ZIP signatures: a normal archive, an empty one, and a spanned one.
  // An empty archive is the one that surprises people — it has no local file
  // header at all, so the central-directory-end signature is what identifies it.
  { mime: "application/zip", offset: 0, magic: [0x50, 0x4b, 0x03, 0x04] },
  { mime: "application/zip", offset: 0, magic: [0x50, 0x4b, 0x05, 0x06] },
  { mime: "application/zip", offset: 0, magic: [0x50, 0x4b, 0x07, 0x08] },
];

function matches(bytes: Uint8Array, offset: number, magic: readonly (number | null)[]): boolean {
  if (bytes.length < offset + magic.length) return false;
  for (let i = 0; i < magic.length; i += 1) {
    const expected = magic[i];
    if (expected === null) continue;
    if (bytes[offset + i] !== expected) return false;
  }
  return true;
}

/**
 * The media type these bytes really are, or null for one we do not accept.
 *
 * The MP3 frame-sync signature (`ff` followed by anything) is the loosest entry
 * in the table and is therefore tried LAST — the list is walked in order, so a
 * JPEG, which also begins `ff`, is identified as a JPEG by the longer signature
 * above it. Reordering this list is not a tidy-up.
 */
export function sniffMime(bytes: Uint8Array): string | null {
  for (const signature of SIGNATURES) {
    if (!matches(bytes, signature.offset, signature.magic)) continue;
    if (signature.also && !matches(bytes, signature.also.offset, signature.also.magic)) {
      continue;
    }
    // The frame-sync entry needs its second byte checked properly: eleven set
    // bits means the high three bits of byte two are also set. Doing it here
    // rather than in the table keeps the table a table.
    if (signature.mime === "audio/mpeg" && signature.magic.length === 2) {
      if (bytes.length < 2 || (bytes[1] & 0xe0) !== 0xe0) continue;
    }
    return signature.mime;
  }
  return null;
}

/**
 * Do the bytes agree with what the request claimed?
 *
 * Returns the media type to record. It is always the SNIFFED one — the claim is
 * only used to notice a disagreement worth refusing. A caller that claimed
 * nothing at all is fine and gets the sniffed answer; a caller that claimed
 * something else is refused rather than silently corrected, because the two
 * cases mean different things: no claim is a plain client, a wrong claim is
 * somebody testing what this endpoint believes.
 */
export function agreedMime(bytes: Uint8Array, claimed: string | null): string | null {
  const actual = sniffMime(bytes);
  if (!actual) return null;
  if (!claimed || claimed.trim() === "") return actual;

  const stated = claimed.split(";")[0].trim().toLowerCase();
  if (stated === actual) return actual;
  // A browser sends `image/jpg` for a JPEG often enough that refusing it would
  // be refusing correct files. It is the one alias worth knowing.
  if (stated === "image/jpg" && actual === "image/jpeg") return actual;
  return null;
}
