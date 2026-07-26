// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";

import {
  NEXT_PAYMENT_FORMAT,
  isUpcoming,
  nextPaymentUpdate,
  parseNextPaymentDate,
  todayInUtc,
  toUtcDate,
} from "./next-payment";

describe("parseNextPaymentDate", () => {
  it("takes a plain calendar date", () => {
    expect(parseNextPaymentDate("2026-08-21")).toBe("2026-08-21");
  });

  it("keeps only the day when Digistore24 appends a time", () => {
    expect(parseNextPaymentDate("2026-08-21 00:00:00")).toBe("2026-08-21");
    expect(parseNextPaymentDate("2026-08-21T00:00:00Z")).toBe("2026-08-21");
  });

  it("refuses what is not a date", () => {
    // "0000-00-00" is what a MySQL-shaped source sends for "no date". Written
    // into a Postgres `date` column it throws, and an uncaught throw in the IPN
    // handler 500s the webhook — Digistore24 then redelivers it forever.
    expect(parseNextPaymentDate("0000-00-00")).toBeNull();
    expect(parseNextPaymentDate("2026-02-30")).toBeNull();
    expect(parseNextPaymentDate("21.08.2026")).toBeNull();
    expect(parseNextPaymentDate("")).toBeNull();
    expect(parseNextPaymentDate(null)).toBeNull();
    expect(parseNextPaymentDate(undefined)).toBeNull();
  });
});

describe("nextPaymentUpdate", () => {
  it("stores the date a payment carries", () => {
    expect(nextPaymentUpdate("on_payment", "2026-08-21")).toEqual({
      kind: "set",
      date: "2026-08-21",
    });
    expect(
      nextPaymentUpdate("on_payment_subscription_signup", "2026-08-21"),
    ).toEqual({ kind: "set", date: "2026-08-21" });
  });

  it("leaves a stored date alone when an event carries none", () => {
    expect(nextPaymentUpdate("on_payment", null)).toEqual({ kind: "keep" });
    expect(nextPaymentUpdate("on_rebill_resumed", "")).toEqual({ kind: "keep" });
  });

  it("clears the date on every event that stops the billing", () => {
    // §D3: a stale date advertises a charge that will never be taken, to a
    // customer who just cancelled or was just refunded. That is worse than
    // showing nothing — it inverts the story's own justification.
    for (const event of [
      "on_rebill_cancelled",
      "last_paid_day",
      "on_refund",
      "on_chargeback",
    ]) {
      expect(nextPaymentUpdate(event, null), event).toEqual({ kind: "clear" });
    }
  });

  it("clears even when the stopping event still carries a date", () => {
    // The "don't overwrite a set value with an empty one" idiom — right for
    // every other mirror field — is wrong here, and so is trusting the payload:
    // `last_paid_day` names the day access runs out, not a day money moves.
    expect(nextPaymentUpdate("last_paid_day", "2026-08-21")).toEqual({
      kind: "clear",
    });
    expect(nextPaymentUpdate("on_refund", "2026-08-21")).toEqual({
      kind: "clear",
    });
  });
});

describe("isUpcoming", () => {
  it("shows a date that is still ahead", () => {
    expect(isUpcoming("2026-08-21", "2026-07-22")).toBe(true);
  });

  it("shows the date on the day itself", () => {
    // The day the money moves is the day the Member most wants to see it, and
    // a date equal to today is not stale — it is due.
    expect(isUpcoming("2026-07-22", "2026-07-22")).toBe(true);
  });

  it("hides a date that has passed", () => {
    expect(isUpcoming("2026-07-21", "2026-07-22")).toBe(false);
  });

  it("hides an absent or unusable date", () => {
    expect(isUpcoming(null, "2026-07-22")).toBe(false);
    expect(isUpcoming(undefined, "2026-07-22")).toBe(false);
    expect(isUpcoming("0000-00-00", "2026-07-22")).toBe(false);
  });

  it("compares calendar days, not string length", () => {
    // Guards the lexicographic comparison: it is only sound while both sides
    // are zero-padded YYYY-MM-DD.
    expect(isUpcoming("2026-09-01", "2026-10-01")).toBe(false);
    expect(isUpcoming("2027-01-01", "2026-12-31")).toBe(true);
  });
});

describe("todayInUtc", () => {
  it("names the UTC day of the given instant", () => {
    expect(todayInUtc(new Date("2026-07-22T23:30:00Z"))).toBe("2026-07-22");
    expect(todayInUtc(new Date("2026-07-22T00:00:00Z"))).toBe("2026-07-22");
  });
});

describe("toUtcDate + NEXT_PAYMENT_FORMAT", () => {
  it("keeps the calendar day intact", () => {
    expect(toUtcDate("2026-08-21").toISOString()).toBe(
      "2026-08-21T00:00:00.000Z",
    );
  });

  it("renders the SAME day the mirror stored, in either language", () => {
    // §D1, the whole point of this story. `next_payment_at` is a DATE, not a
    // timestamp. Formatted without the pinned time zone, midnight UTC of
    // 2026-08-21 reads as 20 August for every viewer behind UTC — an
    // off-by-one on the single number this story exists to show.
    const d = toUtcDate("2026-08-21");
    expect(new Intl.DateTimeFormat("de", NEXT_PAYMENT_FORMAT).format(d)).toBe(
      "21. August 2026",
    );
    expect(new Intl.DateTimeFormat("en", NEXT_PAYMENT_FORMAT).format(d)).toBe(
      "August 21, 2026",
    );
  });

  it("is proof against a viewer behind UTC", () => {
    const d = toUtcDate("2026-08-21");
    // What the pin prevents: the same instant, read in a western zone.
    expect(
      new Intl.DateTimeFormat("en", {
        dateStyle: "long",
        timeZone: "America/Los_Angeles",
      }).format(d),
    ).toBe("August 20, 2026");
    // What the page actually does.
    expect(
      new Intl.DateTimeFormat("en", NEXT_PAYMENT_FORMAT).format(d),
    ).toBe("August 21, 2026");
  });
});
