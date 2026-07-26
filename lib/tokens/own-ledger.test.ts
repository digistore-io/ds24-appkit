// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";

import {
  memberLedgerLabel,
  shouldShowTokenTab,
  type OwnLedgerSource,
} from "./own-ledger";

// The whole point of this file: prove that what an Operator typed about a
// customer cannot reach that customer's own screen. leak-guard.test.ts asserts
// the SURFACES never touch `note`; this asserts the READER never hands one out.

const row = (over: Partial<OwnLedgerSource>): OwnLedgerSource => ({
  type: "consume",
  note: null,
  ...over,
});

describe("memberLedgerLabel", () => {
  it("shows the app's own label on a consume row", () => {
    // Written by spendTokens({ note }) — the developer's description of what
    // was charged. This is the "which" in "which tokens were spent".
    expect(memberLedgerLabel(row({ type: "consume", note: "report generation" })))
      .toBe("report generation");
  });

  it("HIDES an Operator's reason on an adjust row", () => {
    // The one that matters. `adjustTokens` writes what an Operator typed for a
    // colleague — "goodwill, do not repeat", "comped, angry on the phone".
    expect(
      memberLedgerLabel(row({ type: "adjust", note: "Kulanz, telefonisch" })),
    ).toBeNull();
  });

  it("hides the German system string on a topup row", () => {
    // payment-event.ts and claim.ts hard-code these. Not translated, and never
    // will be — showing them would put German in front of an English reader.
    expect(
      memberLedgerLabel(row({ type: "topup", note: "Kauf Pro (1000 Token)" })),
    ).toBeNull();
  });

  it("hides notes on a refund row", () => {
    // Nothing writes `refund` today. Defaulting an unknown-origin note to
    // VISIBLE is how this leaks the first time something does.
    expect(memberLedgerLabel(row({ type: "refund", note: "whatever" }))).toBeNull();
  });

  it("survives a missing note", () => {
    expect(memberLedgerLabel(row({ type: "consume", note: null }))).toBeNull();
  });

  it("is deny-by-default for a type it has never heard of", () => {
    // A new tokenLedgerTypeEnum member must not become visible by omission.
    expect(
      memberLedgerLabel({ type: "something_new" as never, note: "secret" }),
    ).toBeNull();
  });
});

describe("shouldShowTokenTab", () => {
  const gate = (sellsTokens: boolean, balance: number, ledgerCount: number) =>
    shouldShowTokenTab({ sellsTokens, balance, ledgerCount });

  it("shows it in an app that sells tokens, even with nothing to show yet", () => {
    // AC 1. The empty state is the right answer here, not a missing tab.
    expect(gate(true, 0, 0)).toBe(true);
  });

  it("hides it when the app sells none AND the Member holds none", () => {
    // AC 2. The only combination that may hide it.
    expect(gate(false, 0, 0)).toBe(false);
  });

  it("KEEPS it for a Member still holding tokens after the mode was switched", () => {
    // AC 3, and the half that gets dropped. A display setting must never take
    // away the view of money somebody paid — that is a refund request, not a
    // layout change.
    expect(gate(false, 875, 0)).toBe(true);
  });

  it("KEEPS it for a Member who spent down to exactly zero", () => {
    // The case `balance !== 0` alone gets wrong: the balance is 0, but there is
    // a history explaining where it went, and that is precisely when somebody
    // goes looking.
    expect(gate(false, 0, 4)).toBe(true);
  });

  it("never hides a non-empty account, whatever the mode says", () => {
    for (const sells of [true, false]) {
      for (const [balance, count] of [[875, 4], [0, 1], [10, 0]] as const) {
        expect(gate(sells, balance, count), `${sells} ${balance} ${count}`).toBe(
          true,
        );
      }
    }
  });
});
