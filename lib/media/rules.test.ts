// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";

import {
  MEDIA_KINDS,
  formatBytes,
  kindForMime,
  needsAlt,
  refuseUpload,
  safeFilename,
  storageKey,
  type MediaRules,
} from "./rules";

const RULES: MediaRules = {
  kinds: {
    image: {
      maxBytes: 1000,
      mimeTypes: ["image/jpeg", "image/png"],
      signedUrlSeconds: 300,
    },
    video: { maxBytes: 5000, mimeTypes: ["video/mp4"], signedUrlSeconds: 21600 },
    audio: { maxBytes: 5000, mimeTypes: ["audio/mpeg"], signedUrlSeconds: 21600 },
    file: { maxBytes: 2000, mimeTypes: ["application/pdf", "application/zip"], signedUrlSeconds: 300 },
  },
  mayUpload: {
    member: ["image/jpeg", "application/pdf"],
    owner: ["image/jpeg", "image/png", "video/mp4", "application/zip"],
  },
};

describe("kindForMime", () => {
  it("finds the kind a media type belongs to", () => {
    expect(kindForMime(RULES, "image/png")).toBe("image");
    expect(kindForMime(RULES, "video/mp4")).toBe("video");
    expect(kindForMime(RULES, "application/pdf")).toBe("file");
  });

  it("is case- and whitespace-insensitive, because headers are", () => {
    expect(kindForMime(RULES, " IMAGE/PNG ")).toBe("image");
  });

  it("answers null for something this installation does not take", () => {
    expect(kindForMime(RULES, "application/x-msdownload")).toBeNull();
  });
});

describe("refuseUpload", () => {
  it("lets through what the role is allowed and the ceiling permits", () => {
    expect(refuseUpload(RULES, { role: "member", mime: "image/jpeg", bytes: 500 })).toBeNull();
  });

  it("refuses an unknown type before it considers the size", () => {
    // The order is the point: "10 MB is too large" is a confusing answer to
    // somebody who uploaded a format the app never accepts.
    expect(
      refuseUpload(RULES, { role: "member", mime: "application/x-msdownload", bytes: 9_999_999 }),
    ).toBe("typeNotAllowed");
  });

  it("refuses a type this role may not upload, even though the app accepts it", () => {
    // A ZIP is a legitimate kind here — but a member handing every other member
    // an archive is not a media feature.
    expect(refuseUpload(RULES, { role: "member", mime: "application/zip", bytes: 10 })).toBe(
      "notAllowedForRole",
    );
    expect(refuseUpload(RULES, { role: "owner", mime: "application/zip", bytes: 10 })).toBeNull();
  });

  it("refuses a role nobody declared, rather than defaulting to permissive", () => {
    expect(refuseUpload(RULES, { role: "guest", mime: "image/jpeg", bytes: 10 })).toBe(
      "notAllowedForRole",
    );
  });

  it("applies the ceiling of the kind, not one global number", () => {
    expect(refuseUpload(RULES, { role: "owner", mime: "image/jpeg", bytes: 1001 })).toBe(
      "tooLarge",
    );
    // The same size is fine as a video, because videos have their own ceiling.
    expect(refuseUpload(RULES, { role: "owner", mime: "video/mp4", bytes: 1001 })).toBeNull();
  });

  it("refuses an empty file", () => {
    expect(refuseUpload(RULES, { role: "member", mime: "image/jpeg", bytes: 0 })).toBe("noFile");
  });
});

describe("needsAlt", () => {
  it("is true for images and false for everything else", () => {
    expect(needsAlt("image")).toBe(true);
    for (const kind of MEDIA_KINDS.filter((k) => k !== "image")) {
      // A PDF has no alternative text, and demanding one produces the thing
      // accessibility rules exist to prevent: a field filled in with "file".
      expect(needsAlt(kind)).toBe(false);
    }
  });
});

describe("storageKey", () => {
  const createdAt = new Date("2026-03-09T10:00:00Z");

  it("uses the id, the kind and the month", () => {
    expect(storageKey({ id: "abc", kind: "image", mime: "image/png", createdAt })).toBe(
      "image/2026/03/abc.png",
    );
  });

  it("pads the month, so the prefixes sort", () => {
    expect(
      storageKey({
        id: "x",
        kind: "file",
        mime: "application/pdf",
        createdAt: new Date("2026-11-01T00:00:00Z"),
      }),
    ).toBe("file/2026/11/x.pdf");
  });

  it("falls back to .bin rather than inventing an extension", () => {
    expect(storageKey({ id: "x", kind: "file", mime: "application/whatever", createdAt })).toBe(
      "file/2026/03/x.bin",
    );
  });

  it("takes the month from UTC, so two nodes in two zones agree", () => {
    // 23:30 on the 31st in Berlin is still the 31st in UTC; an hour later it is
    // the 1st. A key that depends on the host's clock zone is a key the other
    // node cannot compute.
    const newYear = new Date("2026-12-31T23:30:00Z");
    expect(storageKey({ id: "x", kind: "image", mime: "image/png", createdAt: newYear })).toBe(
      "image/2026/12/x.png",
    );
  });
});

describe("safeFilename", () => {
  it("keeps an ordinary name", () => {
    expect(safeFilename("Rechnung 2026 (final).pdf", "pdf")).toBe("Rechnung 2026 (final).pdf");
  });

  it("strips what would break a Content-Disposition header", () => {
    // A quote or a newline in a header value is a header injection, and this
    // name came from whoever uploaded the file.
    expect(safeFilename('evil".pdf\r\nX-Bad: 1', "pdf")).not.toContain('"');
    expect(safeFilename('evil".pdf\r\nX-Bad: 1', "pdf")).not.toContain("\n");
    expect(safeFilename('evil".pdf\r\nX-Bad: 1', "pdf")).not.toContain("\r");
  });

  it("does not let a name climb out of anywhere", () => {
    expect(safeFilename("../../etc/passwd", "bin")).not.toContain("/");
    expect(safeFilename("..", "bin")).toBe("download.bin");
  });

  it("gives an empty name a real one", () => {
    // Otherwise the browser saves it under the URL's last segment, which is the
    // storage key this function exists to keep out of sight.
    expect(safeFilename("", "png")).toBe("download.png");
    expect(safeFilename("   ", "png")).toBe("download.png");
  });

  it("bounds the length", () => {
    expect(safeFilename("a".repeat(500), "pdf").length).toBeLessThanOrEqual(120);
  });
});

describe("formatBytes", () => {
  it("reads like a size a person would say", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10 MB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("follows the locale, because a refusal is shown to a person", () => {
    expect(formatBytes(1536, "de")).toBe("1,5 KB");
  });
});

describe("safeFilename keeps a usable extension", () => {
  it("does not treat a trailing dot as one", () => {
    // The guard was `dot > 0 && cleaned.length - dot <= 12`, which a name
    // ending in a bare dot satisfies: `ext` became "." and the fallback was
    // never applied, producing 120 characters with nothing to open. Not
    // contrived — the sanitiser strips quotes, so `…report."` arrives here as
    // `…report.`.
    const out = safeFilename(`${"a".repeat(200)}.`, "pdf");
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out.endsWith(".pdf")).toBe(true);
  });

  it("keeps a real extension when it shortens the stem", () => {
    expect(safeFilename(`${"a".repeat(200)}.pdf`, "bin").endsWith(".pdf")).toBe(true);
  });
});
