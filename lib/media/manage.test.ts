// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// `mayAccess()` and the deletion path — the two pieces of this feature that
// decide who gets somebody else's file and whether "delete my account" is true.
//
// ── Why this file exists ───────────────────────────────────────────────────
// A code review found that neither had a test. `mayAccess()` is the most
// security-critical function in the media layer — an owner comparison, a
// `hasPlan()` call, and a deliberate asymmetry that lets an operator fetch
// product content but not a customer's own upload — and nothing exercised any
// of it. Story 9.1 names one of these as an acceptance criterion in its own
// right: *"a test asserts the store was asked to remove them"*.
//
// ── What is faked, and what is not ─────────────────────────────────────────
// The database and the object store are mocked; the LOGIC is not. That is the
// point: these tests are about which branch is taken, and a real Postgres would
// only make them slower and flakier without testing anything more. The round
// trip against real storage is `node run.mjs media-check`, which is a different
// question and has its own command.
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MediaRow } from "@/db/schema-media";

const hasPlan = vi.fn<(memberId: string, productKey: string) => Promise<boolean>>();
const remove = vi.fn<(key: string) => Promise<void>>();
const deleteWhere = vi.fn();
const selected = vi.fn<() => Promise<MediaRow[]>>();

vi.mock("@/lib/entitlements/manage", () => ({ hasPlan: (m: string, p: string) => hasPlan(m, p) }));

vi.mock("./store", () => ({
  mediaStore: () => ({ remove, put: vi.fn(), head: vi.fn(), getBytes: vi.fn() }),
}));

// `where()` has to be BOTH awaitable and chainable: `listOwnedMedia` awaits it
// directly, `findMedia` calls `.limit(1)` on it first. A mock that offers only
// one of the two fails on the other with "rows is not iterable", which says
// nothing about the code under test.
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => {
          const result = selected();
          return Object.assign(result, { limit: () => result });
        },
      }),
    }),
    delete: () => ({ where: deleteWhere }),
  },
}));

// `planProblem` reads the product registry; the branch under test is "does a
// retired key deny or throw", so the answer is supplied per test.
const planProblem = vi.fn<(key: string) => string | null>();
vi.mock("./config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./config")>()),
  planProblem: (key: string) => planProblem(key),
}));

const { mayAccess, deleteOwnedMedia } = await import("./manage");

function row(over: Partial<MediaRow> = {}): MediaRow {
  return {
    id: "m1",
    ownerId: "alice",
    kind: "image",
    visibility: "owner",
    requiresPlan: null,
    storageKey: "image/2026/07/m1.png",
    mime: "image/png",
    filename: null,
    bytes: 10,
    width: null,
    height: null,
    durationSeconds: null,
    sha256: "x",
    source: "upload",
    alt: "a picture",
    prompt: null,
    provider: null,
    model: null,
    createdAt: new Date(),
    ...over,
  } as MediaRow;
}

beforeEach(() => {
  hasPlan.mockReset().mockResolvedValue(false);
  remove.mockReset().mockResolvedValue(undefined);
  deleteWhere.mockReset().mockResolvedValue(undefined);
  selected.mockReset().mockResolvedValue([]);
  planProblem.mockReset().mockReturnValue(null);
});

describe("mayAccess — public", () => {
  it("lets anybody have it, signed in or not", async () => {
    const item = row({ visibility: "public" });
    expect(await mayAccess(item, { memberId: null, role: null })).toBe(true);
    expect(await mayAccess(item, { memberId: "bob", role: "member" })).toBe(true);
  });

  it("asks the entitlement layer nothing", async () => {
    // A session lookup in front of every product image on a page a signed-out
    // visitor is looking at would be the cost of getting this branch wrong.
    await mayAccess(row({ visibility: "public" }), { memberId: null, role: null });
    expect(hasPlan).not.toHaveBeenCalled();
  });
});

describe("mayAccess — owner", () => {
  const item = row({ visibility: "owner", ownerId: "alice" });

  it("lets the owner have it", async () => {
    expect(await mayAccess(item, { memberId: "alice", role: "member" })).toBe(true);
  });

  it("refuses another member", async () => {
    expect(await mayAccess(item, { memberId: "bob", role: "member" })).toBe(false);
  });

  it("refuses a signed-out visitor", async () => {
    expect(await mayAccess(item, { memberId: null, role: null })).toBe(false);
  });

  it("refuses an OPERATOR, deliberately", async () => {
    // The asymmetry that is easiest to "fix" and must not be. A customer's own
    // upload is their data; an operator who wants to see what a customer sees
    // has `impersonation`, which is recorded. Reading it straight out of an
    // admin session would be the same capability without the record.
    expect(await mayAccess(item, { memberId: "carol", role: "owner" })).toBe(false);
  });

  it("refuses a row with no owner", async () => {
    // `ownerId` is `set null` when an account goes, so an orphaned row must not
    // become readable by whoever happens to be signed out.
    expect(await mayAccess(row({ visibility: "owner", ownerId: null }), {
      memberId: null,
      role: null,
    })).toBe(false);
  });
});

describe("mayAccess — entitled", () => {
  const item = row({ visibility: "entitled", ownerId: null, requiresPlan: "basis" });

  it("lets a member who holds the plan have it", async () => {
    hasPlan.mockResolvedValue(true);
    expect(await mayAccess(item, { memberId: "bob", role: "member" })).toBe(true);
    expect(hasPlan).toHaveBeenCalledWith("bob", "basis");
  });

  it("refuses a member who does not", async () => {
    hasPlan.mockResolvedValue(false);
    expect(await mayAccess(item, { memberId: "bob", role: "member" })).toBe(false);
  });

  it("refuses a signed-out visitor without asking", async () => {
    expect(await mayAccess(item, { memberId: null, role: null })).toBe(false);
    expect(hasPlan).not.toHaveBeenCalled();
  });

  it("lets the OPERATOR have it — it is their own product", async () => {
    // The other half of the asymmetry above. `entitled` content is what the
    // operator uploaded and sells; refusing them their own workbook would be
    // theatre.
    expect(await mayAccess(item, { memberId: "carol", role: "owner" })).toBe(true);
    expect(hasPlan).not.toHaveBeenCalled();
  });

  it("refuses a row with no plan named", async () => {
    expect(await mayAccess(row({ visibility: "entitled", requiresPlan: null }), {
      memberId: "bob",
      role: "member",
    })).toBe(false);
  });

  it("DENIES rather than throwing when the plan was retired", async () => {
    // Write-time validation cannot cover a later edit to
    // `config/digistore-products.json`, and `hasPlan()` throws on a key it does
    // not know — so without this the delivery route and every server component
    // rendering the item answered 500 instead of refusing access.
    planProblem.mockReturnValue('no product "basis" in config/digistore-products.json');
    expect(await mayAccess(item, { memberId: "bob", role: "member" })).toBe(false);
    expect(hasPlan).not.toHaveBeenCalled();
  });
});

describe("deleteOwnedMedia", () => {
  it("asks the store to remove the object, not only the row", async () => {
    // The acceptance criterion, and the reason it is one: a foreign key cascade
    // reaches the database and not the bucket, so a row that vanishes on its
    // own leaves a customer's file in storage with nothing left to find it.
    selected.mockResolvedValue([
      row({ id: "m1", storageKey: "image/2026/07/m1.png" }),
      row({ id: "m2", storageKey: "image/2026/07/m2.png" }),
    ]);

    const count = await deleteOwnedMedia("alice");

    expect(count).toBe(2);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith("image/2026/07/m1.png");
    expect(remove).toHaveBeenCalledWith("image/2026/07/m2.png");
    expect(deleteWhere).toHaveBeenCalledTimes(2);
  });

  it("removes the object BEFORE the row", async () => {
    // The order is the whole guarantee. Row first, and a failure in between
    // leaves a file nothing can locate; object first, and the worst case is a
    // row pointing at nothing — visible, and fixable.
    const order: string[] = [];
    remove.mockImplementation(async () => void order.push("object"));
    deleteWhere.mockImplementation(async () => void order.push("row"));
    selected.mockResolvedValue([row()]);

    await deleteOwnedMedia("alice");

    expect(order).toEqual(["object", "row"]);
  });

  it("stops rather than dropping the row when the store refuses", async () => {
    // Deleting the row anyway would lose the only pointer to a file somebody
    // asked to have deleted, and no later run could find it.
    remove.mockRejectedValue(new Error("bucket unreachable"));
    selected.mockResolvedValue([row()]);

    await expect(deleteOwnedMedia("alice")).rejects.toThrow(/bucket unreachable/);
    expect(deleteWhere).not.toHaveBeenCalled();
  });

  it("is quiet for a member with nothing", async () => {
    expect(await deleteOwnedMedia("alice")).toBe(0);
    expect(remove).not.toHaveBeenCalled();
  });
});
