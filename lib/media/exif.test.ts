// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The metadata strip, measured on files built here byte by byte.
//
// Built rather than checked in, so that what each test is about is readable in
// the test: "this JPEG has an APP1 segment containing the string GPS, and after
// the strip it does not" says more than a binary fixture whose contents nobody
// can see in a diff.
import { describe, expect, it } from "vitest";

import { stripMetadata } from "./exif";

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));

/** A JPEG segment: marker, big-endian length (including the two length bytes), payload. */
function segment(marker: number, payload: number[]): number[] {
  const length = payload.length + 2;
  return [0xff, marker, (length >> 8) & 0xff, length & 0xff, ...payload];
}

function jpeg(segments: number[][]): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8, // SOI
    ...segments.flat(),
    0xff,
    0xda, // SOS — everything after this is entropy-coded data
    0x00,
    0x0c,
    ...ascii("scan-data"),
    0xff,
    0xd9, // EOI
  ]);
}

/** A PNG chunk: big-endian length, four-byte type, payload, four CRC bytes. */
function chunk(type: string, payload: number[]): number[] {
  const length = payload.length;
  return [
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...ascii(type),
    ...payload,
    0xde,
    0xad,
    0xbe,
    0xef, // CRC — each chunk carries its own, which is what makes whole-chunk
    //         removal safe with no checksum to recompute anywhere.
  ];
}

function png(chunks: number[][]): Uint8Array {
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunks.flat(),
  ]);
}

/** A RIFF chunk: FourCC, little-endian size, payload, one pad byte if odd. */
function riffChunk(type: string, payload: number[]): number[] {
  const size = payload.length;
  const padded = size % 2 === 1 ? [...payload, 0x00] : payload;
  return [
    ...ascii(type),
    size & 0xff,
    (size >>> 8) & 0xff,
    (size >>> 16) & 0xff,
    (size >>> 24) & 0xff,
    ...padded,
  ];
}

function webp(chunks: number[][]): Uint8Array {
  const body = [...ascii("WEBP"), ...chunks.flat()];
  return new Uint8Array([
    ...ascii("RIFF"),
    body.length & 0xff,
    (body.length >>> 8) & 0xff,
    (body.length >>> 16) & 0xff,
    (body.length >>> 24) & 0xff,
    ...body,
  ]);
}

const text = (bytes: Uint8Array): string => Buffer.from(bytes).toString("latin1");

describe("stripMetadata — JPEG", () => {
  const withEverything = jpeg([
    segment(0xe0, ascii("JFIF\0")), // APP0 — density. Harmless, and kept.
    segment(0xe1, ascii("Exif\0\0GPS 52.5200 13.4050")), // APP1 — the one that matters
    segment(0xe2, ascii("ICC_PROFILE\0colour-data")), // APP2 — colour. Kept.
    segment(0xed, ascii("Photoshop 3.0\0IPTC author")), // APP13 — IPTC
    segment(0xfe, ascii("made with SomeEditor 4.2")), // COM
  ]);

  const stripped = stripMetadata("image/jpeg", withEverything);

  it("removes the location", () => {
    expect(text(withEverything)).toContain("GPS 52.5200");
    expect(text(stripped)).not.toContain("GPS 52.5200");
  });

  it("removes IPTC and the free-text comment", () => {
    expect(text(stripped)).not.toContain("IPTC author");
    expect(text(stripped)).not.toContain("SomeEditor");
  });

  it("KEEPS the colour profile", () => {
    // Removing ICC changes how the picture looks — noticeably, on a wide-gamut
    // screen, in the direction of washed out. A colour profile says how to
    // interpret pixels; it says nothing about where somebody was standing.
    expect(text(stripped)).toContain("ICC_PROFILE");
  });

  it("keeps JFIF, the scan and the end marker", () => {
    expect(text(stripped)).toContain("JFIF");
    expect(text(stripped)).toContain("scan-data");
    expect([...stripped.slice(-2)]).toEqual([0xff, 0xd9]);
  });

  it("gets shorter, and stays a JPEG", () => {
    expect(stripped.length).toBeLessThan(withEverything.length);
    expect([...stripped.slice(0, 2)]).toEqual([0xff, 0xd8]);
  });

  it("does not walk into the scan looking for markers", () => {
    // After SOS the bytes are compressed data in which 0xff pairs occur by
    // accident. Treating one as a segment eats part of the image.
    const withFfInScan = new Uint8Array([
      0xff, 0xd8, ...segment(0xe1, ascii("Exif\0\0GPS")), 0xff, 0xda, 0x00, 0x08,
      0xff, 0xe1, 0xff, 0xed, 0x12, 0x34, 0xff, 0xd9,
    ]);
    const out = stripMetadata("image/jpeg", withFfInScan);
    // The APP1 before the scan is gone; the `ff e1` and `ff ed` pairs INSIDE
    // the scan survive, because they are compressed data and not markers.
    expect(text(out)).not.toContain("GPS");
    expect([...out.slice(-8)]).toEqual([0xff, 0xe1, 0xff, 0xed, 0x12, 0x34, 0xff, 0xd9]);
  });

  it("refuses a file that is not a JPEG rather than handing it back", () => {
    // It used to be handed back untouched. That is the wrong answer: this
    // function's whole promise is that what comes out carries no location, and
    // it cannot promise that about bytes it did not parse.
    expect(() => stripMetadata("image/jpeg", new Uint8Array([1, 2, 3, 4]))).toThrow(
      /not a JPEG/,
    );
  });

  it("keeps stripping past a standalone marker", () => {
    // The finding: `FF01` (TEM) carries no length. Reading the next two bytes
    // as one walked the parser off into the file, it stopped, and it copied the
    // rest — Exif included — verbatim. Measured: the GPS survived.
    const withTem = new Uint8Array([
      0xff, 0xd8, 0xff, 0x01,
      ...segment(0xe1, ascii("Exif\0\0GPS 52.5200 13.4050")),
      0xff, 0xda, 0x00, 0x0c, ...ascii("scan-data"), 0xff, 0xd9,
    ]);
    const out = stripMetadata("image/jpeg", withTem);
    expect(text(out)).not.toContain("GPS 52.5200");
    expect(text(out)).toContain("scan-data");
  });

  it("keeps stripping past a run of padding bytes", () => {
    // A run of 0xFF before a marker is legal. Refusing it would reject valid
    // files; the fix has to skip padding and still find the APP1 behind it.
    const padded = new Uint8Array([
      0xff, 0xd8, 0xff, 0xff, 0xff,
      ...segment(0xe1, ascii("Exif\0\0GPS 52.5200")),
      0xff, 0xda, 0x00, 0x0c, ...ascii("scan-data"), 0xff, 0xd9,
    ]);
    expect(text(stripMetadata("image/jpeg", padded))).not.toContain("GPS 52.5200");
  });

  it("refuses a segment that claims to run past the end of the file", () => {
    const liar = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xf0, 1, 2, 3]);
    expect(() => stripMetadata("image/jpeg", liar)).toThrow(/past end of file/);
  });
});

describe("stripMetadata — PNG", () => {
  const withEverything = png([
    chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
    chunk("eXIf", ascii("GPS 52.5200 13.4050")),
    chunk("tEXt", ascii("Author\0Someone")),
    chunk("iTXt", ascii("XML:com.adobe.xmp\0…")),
    chunk("tIME", [0x07, 0xea, 1, 1, 0, 0, 0]),
    chunk("IDAT", ascii("pixels")),
    chunk("IEND", []),
  ]);

  const stripped = stripMetadata("image/png", withEverything);

  it("removes the metadata chunks", () => {
    expect(text(stripped)).not.toContain("GPS 52.5200");
    expect(text(stripped)).not.toContain("Author");
    expect(text(stripped)).not.toContain("adobe.xmp");
    expect(text(stripped)).not.toContain("tIME");
  });

  it("keeps the header, the pixels and the end", () => {
    expect(text(stripped)).toContain("IHDR");
    expect(text(stripped)).toContain("pixels");
    expect(text(stripped)).toContain("IEND");
  });

  it("keeps the signature", () => {
    expect([...stripped.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it("refuses a chunk that claims to run past the end of the file", () => {
    // The finding: the walk stopped on the liar and copied the tail verbatim,
    // so every metadata chunk after it survived. Measured: the GPS came back.
    const liar = png([
      chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]).map((b, i) =>
        i < 4 ? [0, 0xff, 0xff, 0xff][i] : b,
      ),
      chunk("eXIf", ascii("GPS 52.5200 13.4050")),
      chunk("IEND", []),
    ]);
    expect(() => stripMetadata("image/png", liar)).toThrow(/past end of file/);
  });
});

describe("stripMetadata — WebP", () => {
  const withExif = webp([
    riffChunk("VP8 ", ascii("pixel-data")),
    riffChunk("EXIF", ascii("GPS 52.5200")),
    riffChunk("XMP ", ascii("xmp-data")),
  ]);

  const stripped = stripMetadata("image/webp", withExif);

  it("removes EXIF and XMP", () => {
    expect(text(stripped)).not.toContain("GPS 52.5200");
    expect(text(stripped)).not.toContain("xmp-data");
  });

  it("keeps the pixels", () => {
    expect(text(stripped)).toContain("pixel-data");
  });

  it("rewrites the RIFF size to match what is left", () => {
    // A file whose declared size no longer matches its contents is one some
    // decoders read and others reject.
    const declared = new DataView(stripped.buffer, stripped.byteOffset).getUint32(4, true);
    expect(declared).toBe(stripped.length - 8);
  });

  it("leaves a file with nothing to strip byte-identical", () => {
    const clean = webp([riffChunk("VP8 ", ascii("pixel-data"))]);
    expect(stripMetadata("image/webp", clean)).toEqual(clean);
  });

  it("refuses a truncated file rather than silently dropping the pixels", () => {
    // The finding: the walk stopped, the remaining chunks were discarded, and
    // the RIFF size was rewritten to match — so a 42-byte image became a
    // 12-byte header that looked entirely consistent.
    const truncated = withExif.slice(0, withExif.length - 6);
    expect(() => stripMetadata("image/webp", truncated)).toThrow(/past end of file/);
  });
});

describe("stripMetadata — everything else", () => {
  it("hands video back untouched, and that is the documented limit", () => {
    // An MP4 can carry its recording location in an atom. Taking it out means
    // walking the atom tree and rewriting the offsets that depend on it, and
    // half of that is worse than none — a half-stripped file reads as
    // protected. docs/data-protection.md says so plainly instead.
    const mp4 = new Uint8Array([0, 0, 0, 0x20, ...ascii("ftypisom©xyz+52.5200")]);
    expect(stripMetadata("video/mp4", mp4)).toEqual(mp4);
  });

  it("hands a PDF back untouched", () => {
    const pdf = new Uint8Array(ascii("%PDF-1.7 ..."));
    expect(stripMetadata("application/pdf", pdf)).toEqual(pdf);
  });
});

// ── The residues the first strip-hardening left behind ─────────────────────
//
// A second review pass measured all three. The hardening was right in
// direction and wrong at the boundary: it walked to the end of the BUFFER
// instead of to the end the RIFF header declares, so a valid file with padding
// after it was refused, a short tail was still silently dropped, and the VP8X
// flag clear wrote through a `subarray` into the caller's own bytes.

describe("stripWebp boundaries", () => {
  const pixels = riffChunk("VP8 ", ascii("pixel-data"));

  it("accepts a file with bytes after the declared RIFF end", () => {
    // Eight or more trailing bytes used to throw "chunk length past end of
    // file" on a picture that reads perfectly everywhere else. The RIFF size
    // says where the image stops; anything after it is not the image.
    const base = webp([pixels, riffChunk("EXIF", ascii("GPS 52.5200"))]);
    const padded = new Uint8Array([...base, ...new Array(16).fill(0x00)]);

    const out = stripMetadata("image/webp", padded);
    expect(new TextDecoder().decode(out)).not.toContain("GPS");
    expect(new TextDecoder().decode(out)).toContain("pixel-data");
  });

  it("refuses a short tail rather than dropping it silently", () => {
    // The bug the hardening was written for, still live in the WebP path: one
    // to seven bytes past the last chunk were discarded AND the RIFF size was
    // rewritten to match, so the file that came out looked internally
    // consistent and was not the file that went in.
    const body = [...ascii("WEBP"), ...pixels, 0x01, 0x02, 0x03];
    const lying = new Uint8Array([
      ...ascii("RIFF"),
      body.length & 0xff,
      (body.length >>> 8) & 0xff,
      (body.length >>> 16) & 0xff,
      (body.length >>> 24) & 0xff,
      ...body,
    ]);
    expect(() => stripMetadata("image/webp", lying)).toThrow(/trailing bytes/);
  });

  it("refuses a RIFF size that runs past the file", () => {
    const truncated = webp([pixels]).slice(0, -4);
    expect(() => stripMetadata("image/webp", truncated)).toThrow(/past end of file/);
  });

  it("does not write into the caller's buffer", () => {
    // `body` held `subarray()` VIEWS, so clearing the VP8X flag bits changed
    // the argument that was passed in — in a function documented as returning
    // a new image and leaving its input alone.
    const vp8x = riffChunk("VP8X", [0b0000_1100, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const input = webp([vp8x, pixels, riffChunk("EXIF", ascii("GPS"))]);
    const before = Uint8Array.from(input);

    stripMetadata("image/webp", input);

    expect(Array.from(input)).toEqual(Array.from(before));
  });

  it("still clears the flags on the copy it returns", () => {
    const vp8x = riffChunk("VP8X", [0b0000_1100, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const out = stripMetadata("image/webp", webp([vp8x, pixels, riffChunk("EXIF", ascii("GPS"))]));
    // 12 bytes of RIFF+WEBP header, then the VP8X FourCC and its size: the
    // flags byte is the first of the payload.
    expect(out[20]).toBe(0);
  });
});

describe("a damaged file is not an unaccepted file", () => {
  it("says the file is damaged, not that JPEGs are refused", () => {
    // `typeNotAllowed` renders as "This kind of file is not accepted here",
    // which is untrue of a JPEG truncated by a flaky mobile connection and
    // sends the person off to convert a format that was never the problem.
    const truncated = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]);
    expect(() => stripMetadata("image/jpeg", truncated)).toThrow(
      expect.objectContaining({ code: "fileDamaged" }),
    );
  });
});
