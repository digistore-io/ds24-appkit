// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The shipped `config/media.json`, held to the same deal `lib/mcp/config.test.ts`
// makes: a second source of truth is only safe while something checks it
// against the first.
import { describe, expect, it } from "vitest";

import { MEDIA_KINDS } from "./rules";
import { DEFAULT_MEDIA_CONFIG, mediaConfig, mediaConfigProblems } from "./config";
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
