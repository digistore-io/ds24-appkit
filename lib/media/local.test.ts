// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The local driver against a real temporary folder.
//
// It is the DEV driver, so it is the one every developer meets first — and the
// store contract it satisfies is the same one the bucket driver satisfies. A
// change that breaks `remove()` here breaks account deletion everywhere.
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLocalStore } from "./local";
import type { MediaStore } from "./store";

let root: string;
let store: MediaStore;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "media-store-"));
  store = createLocalStore(root);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const bytes = new Uint8Array([1, 2, 3, 4, 5]);

describe("the local store", () => {
  it("writes, reads back byte for byte, and reports the size", async () => {
    await store.put("image/2026/07/a.png", bytes, "image/png");
    expect(await store.getBytes("image/2026/07/a.png")).toEqual(bytes);
    expect(await store.head("image/2026/07/a.png")).toEqual({ bytes: 5 });
  });

  it("creates the folders a key implies", async () => {
    await store.put("file/2030/01/deep.pdf", bytes, "application/pdf");
    await expect(stat(join(root, "file/2030/01/deep.pdf"))).resolves.toBeDefined();
  });

  it("answers null for something that is not there, rather than throwing", async () => {
    expect(await store.getBytes("image/2026/07/missing.png")).toBeNull();
    expect(await store.head("image/2026/07/missing.png")).toBeNull();
  });

  it("removes an object", async () => {
    await store.put("image/2026/07/gone.png", bytes, "image/png");
    await store.remove("image/2026/07/gone.png");
    // This is what account deletion depends on. A `remove` that quietly does
    // nothing leaves a customer's file in storage after they were told it was
    // deleted, and nothing in the database can find it afterwards.
    expect(await store.head("image/2026/07/gone.png")).toBeNull();
  });

  it("treats removing something already gone as success", async () => {
    // The caller asked for a state, not for an event. Throwing here would make
    // a retried account deletion fail on the second attempt.
    await expect(store.remove("image/2026/07/never-existed.png")).resolves.toBeUndefined();
  });

  it("refuses a key that would leave the folder", async () => {
    // `rules.ts` derives every key this app writes, so a traversal cannot
    // arrive through the front door. This is the second lock — for a key read
    // back from a database somebody edited, or a future caller that builds one
    // differently.
    await expect(store.put("../escaped.png", bytes, "image/png")).rejects.toThrow(
      /leaves the store/,
    );
    await expect(store.getBytes("../../etc/passwd")).rejects.toThrow(/leaves the store/);
  });

  it("has no public address, which is why delivery goes through the app in DEV", () => {
    // Not a gap. On this driver there IS no address a browser can reach that is
    // not the app, and `lib/media/url.ts` falls back to `/api/media/[id]`
    // because of exactly this answer.
    expect(store.publicUrl("image/2026/07/a.png")).toBeNull();
    expect(store.signedUrl("image/2026/07/a.png", { expiresSeconds: 60 })).toBeNull();
  });

  it("says which driver it is", () => {
    expect(store.driver).toBe("local");
  });
});
