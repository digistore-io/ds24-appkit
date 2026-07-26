// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// When the Member's next charge falls due — a DISPLAY value, and nothing else.
//
// AC 3 is structural, not a matter of review: access is decided by
// `lib/entitlements` from the `grants` table, and `grants` has no next-payment
// column (AD-1, AD-2). Nothing here is imported there, and nothing here may be:
// a date the system happens to know is exactly the shortcut AD-2 forbids —
// access ends by EVENT, never by a date sitting in a mirror.
//
// § D1, the trap this whole file exists around: Digistore24 types
// `next_payment_at` as a **date**, not a timestamp
// (~/digistore-api/updatePurchase.php:26). It is a calendar day with no time
// and no zone. Stored as a timestamp and rendered in the viewer's zone,
// midnight UTC of 2026-08-21 reads as **20 August** for everybody behind UTC —
// an off-by-one on the single number the story exists to show.
//
// So the day travels as a STRING (`date(..., { mode: "string" })` on the
// column, `"YYYY-MM-DD"` through here), and the one place that has to hand a
// `Date` to a formatter — `toUtcDate` — is paired with `NEXT_PAYMENT_FORMAT`,
// which pins the time zone back to UTC. Use the two together or not at all.

/** The pattern of a Digistore24 calendar day, with an optional trailing time. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/;

/**
 * Events after which there is NO next payment.
 *
 * `on_rebill_cancelled` and `last_paid_day` stop the rebilling; `on_refund` and
 * `on_chargeback` reverse the money. In all four cases the stored date names a
 * charge that will never be taken.
 */
export const BILLING_STOPPED_EVENTS = [
  "on_rebill_cancelled",
  "last_paid_day",
  "on_refund",
  "on_chargeback",
] as const;

const STOPPED = new Set<string>(BILLING_STOPPED_EVENTS);

/**
 * What an IPN event does to the stored date.
 *
 * `keep` exists so a rebill that simply does not carry the field cannot wipe a
 * date an earlier delivery did carry — the same fill-only idiom the rest of the
 * mirror uses. `clear` is the deliberate exception to it (see §D3 below).
 */
export type NextPaymentUpdate =
  | { kind: "set"; date: string }
  | { kind: "clear" }
  | { kind: "keep" };

/**
 * The calendar day out of a raw IPN value, or `null` when there is none.
 *
 * Validated, not merely matched: "0000-00-00" is what a MySQL-shaped source
 * sends for "no date", and "2026-02-30" is a day that does not exist. Written
 * into a Postgres `date` column either one throws — and an uncaught throw in
 * the IPN handler 500s the webhook, which Digistore24 answers by redelivering
 * the event forever.
 */
export function parseNextPaymentDate(
  raw: string | null | undefined,
): string | null {
  const m = raw ? DATE_ONLY.exec(raw.trim()) : null;
  if (!m) return null;
  const [, y, mo, d] = m;
  const iso = `${y}-${mo}-${d}`;
  // Round-trip through UTC: a day Date.UTC has to normalise (month 13, the
  // 30th of February, month/day 00) comes back as a different string.
  const probe = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return probe.toISOString().slice(0, 10) === iso ? iso : null;
}

/**
 * §D3 — the date goes stale on cancellation, and stale is worse than absent.
 *
 * The natural mirror idiom ("never overwrite a set value with an empty one") is
 * wrong here. After `on_rebill_cancelled` there is no next payment, but the
 * stored date still names one; the dashboard would then advertise a charge that
 * will never be taken, to a customer who just cancelled. That inverts the
 * story's own justification — "so that the charge is not a surprise".
 *
 * The clear does not care whether the stopping event carried a date of its own:
 * `last_paid_day` names the day ACCESS runs out, not a day money moves.
 */
export function nextPaymentUpdate(
  event: string,
  raw: string | null | undefined,
): NextPaymentUpdate {
  if (STOPPED.has(event)) return { kind: "clear" };
  const date = parseNextPaymentDate(raw);
  return date ? { kind: "set", date } : { kind: "keep" };
}

/** The UTC calendar day of an instant — the reference `isUpcoming` compares against. */
export function todayInUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Is this date worth showing?
 *
 * A plain string comparison, sound because both sides are zero-padded
 * `YYYY-MM-DD`. No `Date` is built from the stored value — that is the §D1 trap.
 *
 * Today counts as upcoming: the day the money moves is the day the Member most
 * wants to see it, and a date equal to today is not stale, it is due. The
 * reference day is UTC, the zone Digistore24's date is stated in; deriving it
 * from the server's local zone would make the same row appear and disappear
 * depending on where the app happens to be hosted.
 */
export function isUpcoming(
  date: string | null | undefined,
  today: string,
): boolean {
  const parsed = parseNextPaymentDate(date);
  return parsed !== null && parsed >= today;
}

/**
 * Midnight UTC of a stored day — the ONLY place a `Date` is built from it.
 *
 * Meaningful solely in combination with `NEXT_PAYMENT_FORMAT`, which reads it
 * back in UTC. Split the pair and the off-by-one is back.
 */
export function toUtcDate(date: string): Date {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * How the next-payment date is formatted — for `useFormatter().dateTime(...)`
 * and `getFormatter().dateTime(...)`, never for `toLocaleDateString`, so the
 * language comes from the request rather than from the server's environment.
 *
 * `timeZone: "UTC"` is load-bearing, not decoration. Without it the instant
 * built by `toUtcDate` is read in the viewer's zone and every viewer behind UTC
 * sees the previous day.
 */
export const NEXT_PAYMENT_FORMAT = {
  dateStyle: "long",
  timeZone: "UTC",
} as const;
