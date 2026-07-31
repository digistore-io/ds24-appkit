// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// `runImageTask`'s guard on `n`.
//
// ── Why this file exists ───────────────────────────────────────────────────
// Nothing tested `runImageTask` at all, and a review pass found two faults in
// one line of it. Both are about what happens BEFORE a provider is reached, so
// they are testable without a network, a key or an adapter — the throw is
// deliberately above the `try` block for the same reason.
//
//   1. `NaN` passed straight through `Math.min(Math.max(1, Math.floor(n)), 10)`
//      — all three of those are `NaN` — and reached the adapter, whose loop
//      then ran zero times. The call was recorded `outcome: "ok"` with no
//      images, no error, and nothing anywhere saying a picture had not been
//      drawn. `Number(formData.get("n"))` on an empty field is how it arrives.
//
//   2. A number above the ceiling was CLAMPED. That reads as kindness and
//      bills for pictures nobody drew: the Server Action computes its price
//      from what it asked for (`check → work → charge`), so a request for
//      twenty that quietly returns ten is ten pictures of margin taken from
//      somebody who did not agree to it.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_IMAGES_PER_CALL, runImageTask } from "./run";
import type { UsageRecord } from "./usage";

// ── Why the recording is stubbed ───────────────────────────────────────────
// The last test below gets PAST the guard on purpose, so the call reaches the
// provider layer, fails there with `noCredential` — and `run.ts` then records
// it, because a failed call is exactly the row an Operator needs. That write
// goes to the real database.
//
// Outside a request there is no `after()`, so `recordUsage` falls back to a
// detached promise; nothing awaits it and `writeQuietly` swallows what comes
// back. On a machine with no database running, that surfaces as a wall of
// `DrizzleQueryError … ECONNREFUSED 127.0.0.1:5432` on stderr — or does not,
// depending on whether the process is still alive when the connection gives
// up, which is why it comes and goes between two runs of the same suite. On a
// machine where `node run.mjs start` IS running, it does not surface at all:
// it quietly inserts a junk row into the developer's own `ai_usage`, which is
// the half of this worth fixing.
//
// So the write is replaced and the record kept. `logLine` and everything else
// stay real — this file is about `runImageTask`, and the less of it that is
// pretend, the more the tests are worth.
const recorded: UsageRecord[] = [];

vi.mock("./usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./usage")>()),
  recordUsage: (record: UsageRecord) => void recorded.push(record),
}));

beforeEach(() => {
  recorded.length = 0;
});

describe("runImageTask refuses an n it cannot honour", () => {
  const ask = (n: unknown) => runImageTask("image", { prompt: "a cat", n: n as number });

  it("refuses NaN rather than drawing nothing and reporting success", async () => {
    await expect(ask(Number.NaN)).rejects.toThrow(RangeError);
  });

  it("refuses more than the ceiling rather than clamping to it", async () => {
    await expect(ask(MAX_IMAGES_PER_CALL + 1)).rejects.toThrow(
      new RegExp(`between 1 and ${MAX_IMAGES_PER_CALL}`),
    );
  });

  it("refuses zero, a negative and a fraction", async () => {
    for (const n of [0, -1, 2.5, Number.POSITIVE_INFINITY]) {
      await expect(ask(n), String(n)).rejects.toThrow(RangeError);
    }
  });

  it("names the value it was given, so the caller can find it", async () => {
    // A message reading "n must be between 1 and 10" against a caller who
    // passed `undefined`-turned-NaN sends somebody to read the wrong line.
    await expect(ask(Number.NaN)).rejects.toThrow(/not NaN/);
    await expect(ask(2.5)).rejects.toThrow(/not 2\.5/);
  });

  it("gets past the guard for a value it can honour", async () => {
    // It will fail afterwards — there is no API key here, and that is the
    // point: the failure must come from the provider layer, not from the
    // guard. `noCredential` is what an unconfigured machine answers.
    await expect(ask(1)).rejects.not.toThrow(RangeError);
  });

  it("records the call that never reached a provider, and names one anyway", async () => {
    // The other half of the same throw, and the reason the stub above keeps
    // the record instead of dropping it: AD-20 says provider and model are set
    // even when nothing was ever asked, so the cost page can say which company
    // the app tried to call. A refusal that leaves no row is a call an Operator
    // cannot see went out.
    await expect(ask(1)).rejects.toThrow();

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ task: "image", outcome: "noCredential" });
    expect(recorded[0].provider).toBeTruthy();
    expect(recorded[0].model).toBeTruthy();
    // Nothing was drawn, so there is nothing to bill for.
    expect(recorded[0].usage).toBeNull();
  });

  it("writes no row at all when the guard refuses", async () => {
    // The throw sits ABOVE the try in `run.ts` for exactly this reason: no
    // provider was reached, nothing was billed, so there is no call to record.
    // A row here would be a failed call on the cost page that never happened.
    await expect(ask(Number.NaN)).rejects.toThrow(RangeError);
    expect(recorded).toHaveLength(0);
  });
});
