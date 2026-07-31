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
 * The `ftyp` brands that mean "an MP4 an app would play".
 *
 * Every entry here is a brand a browser's `<video>` will attempt; the ones left
 * out — `heic`, `heix`, `mif1`, `M4A `, `jp2 ` — are pictures and sound files
 * wearing the same container, and calling them video is how an iPhone
 * photograph ends up stored as a film.
 *
 * **It has to cover the ISO base-media family, not just `isom`.** The first
 * version of this list held eight brands and refused `iso4`, `iso5`, `iso6`,
 * `mp4v`, `mmp4`, `avc3` and `MSNV` — which is every fragmented MP4, i.e. what
 * a phone records and what ffmpeg writes by default. Trading "an iPhone photo
 * is stored as a film" for "an ordinary video cannot be uploaded at all" is not
 * a fix. A brand that is not here still falls through to the rest of the table
 * and is refused as an unknown type: unknown beats confidently wrong, in both
 * directions.
 *
 * `qt  ` is deliberately NOT here. It is QuickTime, not MP4 — a different
 * format in the same container family — and answering `video/mp4` for it stores
 * a `.mov` under a media type no player will accept, which `nosniff` then makes
 * final. It falls through and is refused, which is the honest answer until
 * `video/quicktime` is a type this app carries on purpose.
 */
const VIDEO_BRANDS = [
  "isom", "iso2", "iso4", "iso5", "iso6",
  "mp41", "mp42", "mp4v", "mmp4", "MSNV",
  "avc1", "avc3", "M4V ", "dash",
];

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
  // MP4 and its relatives declare themselves four bytes in, after a length —
  // and then say WHICH relative in the four bytes after that.
  //
  // The brand used to go unchecked, on the reasoning that `ftyp` identifies the
  // container. It does not identify the FORMAT: HEIC (every modern iPhone
  // photograph), M4A and JPEG-2000 all carry `ftyp` too. The measured
  // consequence was that the most likely upload this app will ever see was
  // stored as `video/mp4` — the wrong kind, never stripped of its GPS because
  // video is deliberately not stripped, and unplayable in any player.
  //
  // So the brand is checked, and the list is the video ones only. A brand that
  // is not here is not refused by this entry — it simply falls through to the
  // rest of the table and, finding nothing, is refused as an unknown type.
  // That is the right direction: unknown beats confidently wrong.
  ...VIDEO_BRANDS.map((brand) => ({
    mime: "video/mp4",
    offset: 4,
    magic: ascii("ftyp"),
    also: { offset: 8, magic: ascii(brand) },
  })),
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
/**
 * Media types a browser sends that mean the same thing as ours.
 *
 * Every entry is a type a real browser really sends. `image/jpg` is the classic;
 * the ZIP ones are what Windows Chrome and Edge send for a `.zip`, because that
 * is what the Windows registry says.
 */
// A null prototype, and it is load-bearing rather than tidy. A plain object
// literal inherits from `Object.prototype`, so `ALIASES["constructor"]` answers
// with a FUNCTION — not `undefined` — and `??` never fires. Measured: a
// multipart part sent as `Content-Type: constructor` threw
// `TypeError: (ALIASES[stated] ?? []).includes is not a function` out of
// `acceptUpload()`, which the endpoint reported to the uploader as "storage is
// not reachable" while burning one of their thirty hourly slots. `__proto__`,
// `toString` and `valueOf` are the same trick.
const ALIASES: Record<string, string[]> = Object.assign(Object.create(null), {
  "image/jpg": ["image/jpeg"],
  "image/pjpeg": ["image/jpeg"],
  "image/x-png": ["image/png"],
  "application/x-zip-compressed": ["application/zip"],
  "application/x-zip": ["application/zip"],
  "multipart/x-zip": ["application/zip"],
  "audio/mp3": ["audio/mpeg"],
  "audio/x-wav": ["audio/wav"],
  "audio/wave": ["audio/wav"],
  // `video/quicktime` is deliberately NOT aliased to `video/mp4`. A `.mov` is a
  // different format, and recording it as an MP4 stores something no player
  // will open — with `X-Content-Type-Options: nosniff` making the wrong answer
  // final. See `VIDEO_BRANDS` above.
});

/**
 * What a browser says when it does not know.
 *
 * These are not claims, they are shrugs — and treating a shrug as a lie is how
 * an ordinary upload from an ordinary machine gets refused. The bytes still
 * decide; this only stops the disagreement check from firing on a non-answer.
 */
const UNKNOWING_TYPES = new Set([
  "application/octet-stream",
  "binary/octet-stream",
  "application/unknown",
]);
// `text/plain` is NOT one of them, though it looks like it belongs. It is what
// the registry answers for `.txt`, `.csv` and `.md` — a positive claim about a
// readable file, not a shrug — and none of those sniff as anything, so they are
// refused by the table either way. Listing it here bought nothing and cost the
// mismatch signal: ZIP bytes offered as `text/plain` were accepted as a ZIP.

export function agreedMime(bytes: Uint8Array, claimed: string | null): string | null {
  const actual = sniffMime(bytes);
  if (!actual) return null;
  if (!claimed || claimed.trim() === "") return actual;

  const stated = claimed.split(";")[0].trim().toLowerCase();
  if (stated === actual) return actual;
  if ((ALIASES[stated] ?? []).includes(actual)) return actual;

  // A browser that does not KNOW what it is sending is not lying about it.
  // Windows has no registry entry for half the extensions people upload, and
  // the answer is a generic type — which used to be refused as "the file is not
  // what its name claims it is", accusing an operator of tampering while they
  // uploaded the product they are selling.
  if (UNKNOWING_TYPES.has(stated)) return actual;

  return null;
}
