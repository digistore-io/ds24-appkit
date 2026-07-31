// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The shipped `config/media.json`, held to the same deal `lib/mcp/config.test.ts`
// makes: a second source of truth is only safe while something checks it
// against the first.
import { describe, expect, it, vi } from "vitest";

import { MEDIA_KINDS } from "./rules";
import { DEFAULT_MEDIA_CONFIG, mediaConfig, mediaConfigProblems, planProblem } from "./config";
import { driverFromEnv, mediaStoreProblems } from "./store";

describe("the shipped media config", () => {
  it("is coherent", () => {
    // The build fails here rather than at a customer's first upload. The most
    // likely mistake is a role allowed to upload a media type that belongs to
    // no kind — a rule that can never be satisfied, whose symptom is a refusal
    // with a code that makes no sense.
    expect(mediaConfigProblems()).toEqual([]);
  });

  it("declares every kind", () => {
    const config = mediaConfig();
    for (const kind of MEDIA_KINDS) {
      expect(config.kinds[kind].mimeTypes.length).toBeGreaterThan(0);
      expect(config.kinds[kind].maxBytes).toBeGreaterThan(0);
      expect(config.kinds[kind].signedUrlSeconds).toBeGreaterThan(0);
    }
  });

  it("gives video and audio a longer address life than images", () => {
    // Not a preference. Sixty seconds is plenty for a picture and takes a
    // forty-minute recording down the moment the player asks for a later byte
    // range — the symptom is a video that stops partway through, for some
    // viewers, sometimes.
    const config = mediaConfig();
    expect(config.kinds.video.signedUrlSeconds).toBeGreaterThan(
      config.kinds.image.signedUrlSeconds,
    );
    expect(config.kinds.audio.signedUrlSeconds).toBeGreaterThan(
      config.kinds.image.signedUrlSeconds,
    );
  });

  it("does not let a member upload an archive or an executable", () => {
    // A customer who can hand every other customer a .zip or a .exe is not a
    // media feature. Archives are the operator's.
    const member = mediaConfig().mayUpload.member ?? [];
    expect(member).not.toContain("application/zip");
    expect(member).not.toContain("application/x-msdownload");
  });

  it("accepts no SVG anywhere", () => {
    // An SVG is a document that can carry script. Serving one a customer
    // uploaded is handing every later visitor code somebody else wrote.
    for (const kind of MEDIA_KINDS) {
      expect(mediaConfig().kinds[kind].mimeTypes).not.toContain("image/svg+xml");
    }
  });
});

describe("defaults", () => {
  it("cover every kind, so a file that cannot be read still leaves a usable app", () => {
    for (const kind of MEDIA_KINDS) {
      expect(DEFAULT_MEDIA_CONFIG.kinds[kind]).toBeDefined();
    }
  });
});

describe("driverFromEnv", () => {
  it("treats unset as local, which is the ordinary state of a fresh clone", () => {
    expect(driverFromEnv({} as unknown as NodeJS.ProcessEnv)).toBe("local");
    expect(driverFromEnv({ MEDIA_DRIVER: "" } as unknown as NodeJS.ProcessEnv)).toBe("local");
  });

  it("reads s3", () => {
    expect(driverFromEnv({ MEDIA_DRIVER: "S3" } as unknown as NodeJS.ProcessEnv)).toBe("s3");
  });

  it("throws on anything else rather than falling back", () => {
    // The same refusal `scripts/db/driver.mjs` makes. Quietly starting the
    // wrong store is how an app writes customer files somewhere nobody
    // intended and nobody backs up.
    expect(() => driverFromEnv({ MEDIA_DRIVER: "s4" } as unknown as NodeJS.ProcessEnv)).toThrow();
  });
});

describe("mediaStoreProblems", () => {
  it("is quiet for the local driver", () => {
    expect(mediaStoreProblems({} as unknown as NodeJS.ProcessEnv)).toEqual([]);
  });

  it("names the missing bucket settings", () => {
    const problems = mediaStoreProblems({ MEDIA_DRIVER: "s3" } as unknown as NodeJS.ProcessEnv);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("MEDIA_S3_ENDPOINT");
  });

  it("is quiet once they are all there", () => {
    expect(
      mediaStoreProblems({
        MEDIA_DRIVER: "s3",
        MEDIA_S3_ENDPOINT: "https://fra1.digitaloceanspaces.com",
        MEDIA_S3_BUCKET: "b",
        MEDIA_S3_ACCESS_KEY_ID: "k",
        MEDIA_S3_SECRET_ACCESS_KEY: "s",
      } as unknown as NodeJS.ProcessEnv),
    ).toEqual([]);
  });
});

// ── The lint that switched the whole feature off ───────────────────────────
//
// Added after a code review measured it. `mediaConfigProblems()` grew a check
// for image formats `exif.ts` cannot strip, and `isMediaEnabled()` was
// `enabled && problems.length === 0` — so `image/gif`, which every app
// generated before that change still carries (because `node run.mjs update`
// deliberately never touches `config/`), turned the media feature OFF: uploads
// 503 and every already-stored item 404, photographs and GIFs alike.
//
// The rule these tests hold in place: a configuration mistake refuses what it
// is about, and never stops delivery of what is already in the bucket.

describe("a config problem does not disable delivery", () => {
  it("reports an unstrippable image type without switching media off", async () => {
    vi.resetModules();
    vi.doMock("@/config/media.json", () => ({
      default: {
        enabled: true,
        kinds: { image: { mimeTypes: ["image/jpeg", "image/gif"], maxBytes: 1000 } },
        mayUpload: { owner: ["image/jpeg", "image/gif"] },
      },
    }));
    const mod = await import("./config");

    expect(mod.mediaConfigProblems().join("\n")).toMatch(/image\/gif/);
    // The whole point: still on.
    expect(mod.isMediaEnabled()).toBe(true);
    // And the refusal is exactly as wide as the fault — a GIF upload is
    // refused because no kind accepts it, while JPEG is untouched.
    expect(mod.mediaConfig().kinds.image.mimeTypes).toContain("image/jpeg");
    expect(mod.mediaConfig().kinds.image.mimeTypes).not.toContain("image/gif");
    vi.doUnmock("@/config/media.json");
    vi.resetModules();
  });

  it("drops an SVG from the accepted list rather than refusing to serve anything", async () => {
    vi.resetModules();
    vi.doMock("@/config/media.json", () => ({
      default: {
        enabled: true,
        kinds: { image: { mimeTypes: ["image/png", "image/svg+xml"], maxBytes: 1000 } },
        mayUpload: { owner: ["image/png"] },
      },
    }));
    const mod = await import("./config");

    expect(mod.mediaConfigProblems().join("\n")).toMatch(/SVG/);
    expect(mod.isMediaEnabled()).toBe(true);
    expect(mod.mediaConfig().kinds.image.mimeTypes).not.toContain("image/svg+xml");
    vi.doUnmock("@/config/media.json");
    vi.resetModules();
  });

  it("is off only when the switch says so", async () => {
    vi.resetModules();
    vi.doMock("@/config/media.json", () => ({ default: { enabled: false } }));
    const mod = await import("./config");
    expect(mod.isMediaEnabled()).toBe(false);
    vi.doUnmock("@/config/media.json");
    vi.resetModules();
  });
});

// ── `planProblem()`, which decides whether a sold file can ever be fetched ──
//
// Named as untested by the first review pass and not addressed by it. It is the
// guard standing between `requiresPlan` and `hasPlan()`, and `hasPlan()`
// **throws** on a Product Key it does not know — so a wrong value here does not
// mean "no access", it means the page rendering the item is a 500.

describe("planProblem", () => {
  it("accepts a Product Key that grants access", () => {
    // A subscription is a right, which is what `entitled` visibility needs.
    expect(planProblem("basis_monatlich")).toBeNull();
  });

  it("refuses a key that is in no registry at all", () => {
    // The case that takes a page down: `hasPlan()` throws on it.
    expect(planProblem("no_such_plan")).toMatch(/no product/);
  });

  it("refuses a token package, naming why it could never work", () => {
    // A balance is a quantity, not a right. `hasPlan()` answers false for it
    // for ever, so a file behind one is a file nobody can ever fetch — and the
    // failure is silent, which is worse than the 500 above.
    const problem = planProblem("starter");
    expect(problem).toMatch(/token package/);
    expect(problem).toMatch(/hasPlan/);
  });

  it("refuses an empty key rather than treating it as 'no plan needed'", () => {
    expect(planProblem("")).not.toBeNull();
  });
});
