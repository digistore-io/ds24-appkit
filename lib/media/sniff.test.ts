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

  it("recognises video by the ftyp box four bytes in", () => {
    expect(sniffMime(bytes(0, 0, 0, 0x20, "ftypisom"))).toBe("video/mp4");
    expect(sniffMime(bytes(0, 0, 0, 0x18, "ftypmp42"))).toBe("video/mp4");
    expect(sniffMime(bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe("video/webm");
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

  it("accepts image/jpg, the one alias worth knowing", () => {
    const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0);
    expect(agreedMime(jpeg, "image/jpg")).toBe("image/jpeg");
  });
});
