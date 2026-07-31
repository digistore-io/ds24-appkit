// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";

import { agreedMime, sniffMime } from "./sniff";

const bytes = (...parts: (number | string)[]): Uint8Array => {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === "number") out.push(part);
    else for (const ch of part) out.push(ch.charCodeAt(0));
  }
  // Padded so every signature has the sixteen bytes it may look at.
  while (out.length < 16) out.push(0);
  return new Uint8Array(out);
};

describe("sniffMime", () => {
  it("recognises the image formats", () => {
    expect(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffMime(bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe("image/webp");
    expect(sniffMime(bytes("GIF89a"))).toBe("image/gif");
    expect(sniffMime(bytes("GIF87a"))).toBe("image/gif");
  });

  it("tells the two RIFF containers apart", () => {
    // They share their first four bytes. A four-byte match would call a WAV a
    // WebP and serve a recording as a picture.
    expect(sniffMime(bytes("RIFF", 0, 0, 0, 0, "WAVE"))).toBe("audio/wav");
    expect(sniffMime(bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe("image/webp");
  });

  it("recognises video by the ftyp box AND its brand", () => {
    expect(sniffMime(bytes(0, 0, 0, 0x20, "ftypisom"))).toBe("video/mp4");
    expect(sniffMime(bytes(0, 0, 0, 0x18, "ftypmp42"))).toBe("video/mp4");
    expect(sniffMime(bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe("video/webm");
  });

  it("accepts the ordinary MP4 brands, not only isom", () => {
    // The other half of the finding above, and the more damaging one: narrowing
    // the brand list to eight entries refused every FRAGMENTED MP4 — which is
    // what a phone records and what ffmpeg writes by default. A customer's
    // ordinary video came back "this kind of file is not accepted here".
    for (const brand of ["iso2", "iso4", "iso5", "iso6", "mp41", "mp4v", "mmp4", "avc1", "avc3", "MSNV", "M4V ", "dash"]) {
      expect(sniffMime(bytes(0, 0, 0, 0x18, `ftyp${brand}`)), brand).toBe("video/mp4");
    }
  });

  it("does not call a QuickTime .mov an MP4", () => {
    // `qt  ` was in the brand list and `video/quicktime` was aliased onto
    // `video/mp4`, so a `.mov` was stored and served as an MP4 — which, with
    // `X-Content-Type-Options: nosniff` set globally, plays in no browser at
    // all. Refused as unknown until this app carries `video/quicktime` on
    // purpose.
    expect(sniffMime(bytes(0, 0, 0, 0x18, "ftypqt  "))).toBeNull();
    expect(agreedMime(bytes(0, 0, 0, 0x18, "ftypisom"), "video/quicktime")).toBeNull();
  });

  it("does not call an iPhone photograph a video", () => {
    // The finding. HEIC, M4A and JPEG-2000 all carry `ftyp`, so matching the
    // box alone stored the likeliest upload this app will ever see as
    // `video/mp4` — the wrong kind, never stripped of its GPS because video is
    // deliberately not stripped, and unplayable.
    expect(sniffMime(bytes(0, 0, 0, 0x18, "ftypheic"))).toBeNull();
    expect(sniffMime(bytes(0, 0, 0, 0x18, "ftypheix"))).toBeNull();
    expect(sniffMime(bytes(0, 0, 0, 0x18, "ftypmif1"))).toBeNull();
    expect(sniffMime(bytes(0, 0, 0, 0x18, "ftypM4A "))).toBeNull();
    // Refused as unknown rather than mislabelled — unknown beats confidently
    // wrong, because the customer gets an honest message instead of a file
    // stored under a promise this app cannot keep.
  });

  it("recognises audio, tagged and untagged", () => {
    expect(sniffMime(bytes("ID3", 3, 0))).toBe("audio/mpeg");
    // An MP3 with no tag starts on a frame sync: eleven set bits.
    expect(sniffMime(bytes(0xff, 0xfb))).toBe("audio/mpeg");
    expect(sniffMime(bytes("OggS"))).toBe("audio/ogg");
  });

  it("does not mistake a JPEG for an MP3", () => {
    // Both begin 0xff. The frame-sync signature is the loosest entry in the
    // table and is tried last for exactly this reason — reordering the table is
    // not a tidy-up.
    expect(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
  });

  it("requires the full frame sync, not just the first byte", () => {
    // 0xff followed by something that is not eleven set bits is not audio.
    expect(sniffMime(bytes(0xff, 0x00, 0x00))).toBeNull();
  });

  it("recognises documents and archives, empty ones included", () => {
    expect(sniffMime(bytes("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffMime(bytes(0x50, 0x4b, 0x03, 0x04))).toBe("application/zip");
    // An empty archive has no local file header at all — the end-of-central-
    // directory signature is what identifies it, and forgetting it refuses a
    // perfectly valid ZIP.
    expect(sniffMime(bytes(0x50, 0x4b, 0x05, 0x06))).toBe("application/zip");
  });

  it("answers null for anything else", () => {
    expect(sniffMime(bytes("MZ", 0x90, 0x00))).toBeNull(); // a Windows executable
    expect(sniffMime(bytes("<svg xmlns"))).toBeNull(); // an SVG, deliberately not accepted
    expect(sniffMime(bytes("hello"))).toBeNull();
    expect(sniffMime(new Uint8Array([]))).toBeNull();
  });
});

describe("agreedMime", () => {
  const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

  it("returns the sniffed type when the claim agrees", () => {
    expect(agreedMime(png, "image/png")).toBe("image/png");
  });

  it("ignores the parameters a browser appends", () => {
    expect(agreedMime(png, "image/png; charset=binary")).toBe("image/png");
  });

  it("returns the sniffed type when nothing was claimed", () => {
    // No claim is an ordinary client, not an attack.
    expect(agreedMime(png, null)).toBe("image/png");
    expect(agreedMime(png, "")).toBe("image/png");
  });

  it("refuses a claim that contradicts the bytes", () => {
    // Refused rather than silently corrected: a wrong claim is somebody finding
    // out what this endpoint believes.
    expect(agreedMime(png, "application/pdf")).toBeNull();
  });

  it("refuses bytes it does not recognise, whatever was claimed", () => {
    // The case this whole file exists for: an executable announced as a PNG.
    expect(agreedMime(bytes("MZ", 0x90), "image/png")).toBeNull();
  });

  it("accepts the aliases browsers really send", () => {
    const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0);
    const zip = bytes(0x50, 0x4b, 0x03, 0x04);
    expect(agreedMime(jpeg, "image/jpg")).toBe("image/jpeg");
    // What Windows Chrome and Edge send for a .zip, straight out of the
    // registry. Refusing it told an operator uploading the product they sell
    // that the file "is not what its name claims it is".
    expect(agreedMime(zip, "application/x-zip-compressed")).toBe("application/zip");
  });

  it("treats a shrug as a shrug, not a lie", () => {
    // An OS with no registry entry for the extension answers with a generic
    // type. That is not a claim about the contents, so it cannot contradict
    // them — the bytes still decide.
    const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    expect(agreedMime(png, "application/octet-stream")).toBe("image/png");
    expect(agreedMime(png, "binary/octet-stream")).toBe("image/png");
    // And a shrug still cannot get an unaccepted type in.
    expect(agreedMime(bytes("MZ", 0x90), "application/octet-stream")).toBeNull();
  });

  it("does NOT treat text/plain as a shrug — it is a positive claim", () => {
    // This assertion used to run the other way, and it was wrong. `text/plain`
    // is what the registry answers for `.txt`, `.csv` and `.md`: a statement
    // about the contents, not an absence of one. None of those sniff as
    // anything, so listing it among the shrugs bought nothing at all — while
    // costing the mismatch signal for the case that matters, a binary offered
    // under a text type.
    expect(agreedMime(bytes("PK", 0x03, 0x04), "text/plain")).toBeNull();
    expect(agreedMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "text/plain")).toBeNull();
  });

  it("survives a Content-Type that names something on Object.prototype", () => {
    // `ALIASES` is a null-prototype object for this reason. As a plain literal,
    // `ALIASES["constructor"]` answered with a function rather than `undefined`
    // — `??` never fired — and `.includes` threw a TypeError out of
    // `acceptUpload()`, which the endpoint reported to the uploader as "storage
    // is not reachable" while spending one of their thirty hourly slots.
    const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    for (const hostile of ["constructor", "__proto__", "toString", "valueOf", "hasOwnProperty"]) {
      expect(() => agreedMime(png, hostile), hostile).not.toThrow();
      expect(agreedMime(png, hostile), hostile).toBeNull();
    }
  });

  it("still refuses a claim that genuinely contradicts the bytes", () => {
    const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    expect(agreedMime(png, "application/pdf")).toBeNull();
  });
});
