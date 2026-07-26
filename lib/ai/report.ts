// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// What AI cost — the reads behind the KI-Kosten page. Nothing here writes.
//
// ── Two rules the whole file is shaped by ──────────────────────────────────
//
// 1. **Currencies are never added together.** Every total is per currency, and
//    a figure without its currency is not a figure. A single number made of
//    euros and dollars is a wrong number wearing a right one's clothes.
// 2. **What the report cannot say, it says.** Calls with no price on file,
//    calls that failed, tokens a provider billed without itemising — each is
//    counted separately and shown. A total that quietly excludes half the calls
//    is worse than no total (AD-17).
//
// ── Days mean the Operator's days ──────────────────────────────────────────
// `created_at` is a `timestamp` holding UTC. Truncating it to a day in UTC
// would file an 01:30 Berlin call under the previous date — wrong on every page
// somebody reads at breakfast, and wrong in a way nobody notices until they
// compare a total against an invoice. So both the range boundaries and the
// buckets are computed in `APP_TIME_ZONE`, the zone `i18n/request.ts` renders
// in.
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { aiUsage } from "@/db/schema";

// ── Pure: the choices the page offers ───────────────────────────────────────

export const PERIODS = ["today", "7d", "30d", "month"] as const;
export type Period = (typeof PERIODS)[number];

export const DIMENSIONS = ["none", "task", "model"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const GRANULARITIES = ["none", "day", "week", "month"] as const;
export type Granularity = (typeof GRANULARITIES)[number];

function oneOf<T extends readonly string[]>(
  values: T,
  raw: unknown,
  fallback: T[number],
): T[number] {
  return typeof raw === "string" && (values as readonly string[]).includes(raw)
    ? (raw as T[number])
    : fallback;
}

export interface ReportView {
  period: Period;
  dimension: Dimension;
  granularity: Granularity;
}

/**
 * The view a URL asks for.
 *
 * Anything unrecognised falls back rather than erroring: these values arrive
 * from a query string, which is to say from anybody, and a hand-edited URL
 * should show the default page rather than a stack trace.
 */
export function parseView(params: Record<string, string | string[] | undefined>): ReportView {
  const first = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };
  return {
    period: oneOf(PERIODS, first("period"), "30d"),
    dimension: oneOf(DIMENSIONS, first("by"), "task"),
    granularity: oneOf(GRANULARITIES, first("over"), "none"),
  };
}

/**
 * Which group the Operator opened, if any.
 *
 * It narrows the list of individual calls and **nothing else** — the totals and
 * the breakdown above stay the truth about the whole period. A page where
 * opening one day silently rewrote the month's total would be a page nobody
 * could quote a figure from.
 *
 * Empty strings mean "not focused": that is what a link without the parameter
 * produces, and treating it as a filter would match no calls at all.
 */
export interface CallFocus {
  task?: string;
  /** `provider/model`, exactly as the breakdown renders it. */
  model?: string;
  /** A bucket label, read at the view's own granularity. */
  bucket?: string;
}

/** Long enough for any real task or model id; short enough to keep junk out. */
const FOCUS_MAX = 200;

export function parseFocus(params: Record<string, string | string[] | undefined>): CallFocus {
  const first = (key: string) => {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === "string" && value !== "" && value.length <= FOCUS_MAX
      ? value
      : undefined;
  };
  // The bucket is checked against the shape the page itself produces. Anything
  // else would reach `Intl.DateTimeFormat` and be rendered as "Invalid Date" in
  // a heading — a query-string value shown back to the reader as if it were a
  // date. A task or model id has no such shape and is matched as given.
  const bucket = first("bucket");
  return {
    task: first("task"),
    model: first("model"),
    bucket: bucket && /^\d{4}-\d{2}-\d{2}$/.test(bucket) ? bucket : undefined,
  };
}

export function isFocused(focus: CallFocus): boolean {
  return Boolean(focus.task || focus.model || focus.bucket);
}

export function appTimeZone(): string {
  return process.env.APP_TIME_ZONE ?? "Europe/Berlin";
}

// ── Pure: time zones without a date library ─────────────────────────────────

/**
 * How far a zone is from UTC at a given instant, in milliseconds.
 *
 * Computed rather than configured, because the answer changes twice a year and
 * a stored offset is wrong for half of it. `Intl` knows the rules; nothing else
 * in this file has to.
 */
export function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // Some ICU versions render midnight as hour 24 under `hour12: false`.
  const hour = get("hour") % 24;

  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
  // `formatToParts` drops sub-second precision, so the raw difference carries
  // the milliseconds of `at` as noise. Zone offsets are whole minutes.
  return Math.round((asIfUtc - at.getTime()) / 60_000) * 60_000;
}

/** The wall-clock date in a zone, as a `Date` whose UTC fields hold it. */
function localFields(at: Date, timeZone: string): Date {
  return new Date(at.getTime() + zoneOffsetMs(at, timeZone));
}

/**
 * The instant a local wall-clock time corresponds to.
 *
 * The offset is read twice: once at the naive guess and once at the candidate
 * it produces. On the two days a year a zone shifts, the offset at midnight is
 * not the offset at noon, and reading it once puts the boundary an hour out.
 */
function instantOfLocal(asIfUtc: number, timeZone: string): Date {
  const guess = new Date(asIfUtc - zoneOffsetMs(new Date(asIfUtc), timeZone));
  return new Date(asIfUtc - zoneOffsetMs(guess, timeZone));
}

export function startOfDayInZone(at: Date, timeZone: string): Date {
  const local = localFields(at, timeZone);
  return instantOfLocal(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
    timeZone,
  );
}

export function startOfMonthInZone(at: Date, timeZone: string): Date {
  const local = localFields(at, timeZone);
  return instantOfLocal(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1), timeZone);
}

/**
 * The start of the day `days` away, counted in CALENDAR days.
 *
 * Not `- n × 86_400_000`. The day a zone springs forward is 23 hours long, so
 * flat arithmetic across it lands an hour short, truncates back to the previous
 * day, and quietly widens a "last 7 days" range to eight — which shows up as a
 * total that disagrees with the same total computed the day before.
 * `Date.UTC` normalises an out-of-range day number, so month and year ends
 * need no special case.
 */
export function addDaysInZone(at: Date, days: number, timeZone: string): Date {
  const local = localFields(at, timeZone);
  return instantOfLocal(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + days),
    timeZone,
  );
}

export interface Range {
  from: Date;
  /** Exclusive. */
  to: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The window a period covers, in the Operator's own days.
 *
 * "7 days" means the last seven days **including today**, not "168 hours ago" —
 * that is what somebody means when they pick it, and the difference shows up as
 * a half-empty first bucket that makes a chart look like traffic collapsed.
 *
 * `to` is now rather than the end of the day: a range reaching into the future
 * would put empty buckets on the report for hours that have not happened.
 */
export function rangeFor(period: Period, now: Date, timeZone: string): Range {
  const startToday = startOfDayInZone(now, timeZone);
  const daysBack = (n: number) => addDaysInZone(startToday, -n, timeZone);

  switch (period) {
    case "today":
      return { from: startToday, to: now };
    case "7d":
      return { from: daysBack(6), to: now };
    case "30d":
      return { from: daysBack(29), to: now };
    case "month":
      return { from: startOfMonthInZone(now, timeZone), to: now };
  }
}

// ── Pure: the buckets a period contains ─────────────────────────────────────

/** The label an instant falls into. Matches exactly what the query returns. */
export function bucketLabelFor(
  at: Date,
  granularity: Exclude<Granularity, "none">,
  timeZone: string,
): string {
  const local = localFields(at, timeZone);
  const iso = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

  if (granularity === "month") {
    return iso(new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1)));
  }
  if (granularity === "week") {
    // Postgres `date_trunc('week')` starts on Monday. JS counts Sunday as 0, so
    // Sunday goes back six days rather than none — the off-by-one that would
    // otherwise put one day a week in a bucket the query never produces.
    const back = local.getUTCDay() === 0 ? 6 : local.getUTCDay() - 1;
    return iso(new Date(local.getTime() - back * DAY_MS));
  }
  return iso(local);
}

/**
 * Every bucket a range contains, in order — including the empty ones.
 *
 * A day with no calls produces no row, and a table that simply omits it reads
 * as a quiet day rather than a missing one, which is exactly backwards when
 * somebody is looking for the day something broke (AC 7.2).
 */
export function bucketLabels(
  range: Range,
  granularity: Granularity,
  timeZone: string,
): string[] {
  if (granularity === "none") return [];

  const labels: string[] = [];
  const seen = new Set<string>();

  // Walked day by day and labelled: coarse, exact, and bounded by a month of
  // iterations. Weeks and months collapse by themselves through the `seen` set,
  // so there is one stepping rule rather than three.
  let cursor = startOfDayInZone(range.from, timeZone);
  while (cursor.getTime() < range.to.getTime()) {
    const label = bucketLabelFor(cursor, granularity, timeZone);
    if (!seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
    cursor = addDaysInZone(cursor, 1, timeZone);
  }
  // A range shorter than a day — "today", opened at 00:05 — still has a bucket.
  if (labels.length === 0) labels.push(bucketLabelFor(range.from, granularity, timeZone));
  return labels;
}

// ── The queries ─────────────────────────────────────────────────────────────

/**
 * `created_at` truncated to a bucket, in the app's time zone.
 *
 * The double cast is the load-bearing part: the column is a `timestamp` that
 * MEANS UTC, so it is first told so and only then moved into the display zone.
 * Truncating without that files a small-hours call under the wrong date, and a
 * report that disagrees with an invoice by one day's traffic is the kind of
 * error somebody chases for an afternoon.
 */
function bucketExpr(granularity: Exclude<Granularity, "none">, timeZone: string) {
  return sql<string>`to_char(date_trunc(${granularity}, ${aiUsage.createdAt} at time zone 'UTC' at time zone ${timeZone}), 'YYYY-MM-DD')`;
}

function within(range: Range) {
  return and(gte(aiUsage.createdAt, range.from), lt(aiUsage.createdAt, range.to));
}

/** Postgres returns `bigint`/`numeric` sums as strings. Everything goes through this. */
function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** A total, and the currency without which it means nothing. */
export interface CurrencyTotal {
  currency: string;
  costMicros: number;
  calls: number;
}

export interface Summary {
  /** One entry per currency in the period. Usually one. Never summed. */
  totals: CurrencyTotal[];
  /** Every call in the period — priced or not, successful or not. */
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  /** Calls whose model has no price on file. Excluded from `totals`. */
  unpricedCalls: number;
  failedCalls: number;
  /** Billed but not itemised by the provider — the standing guard of FR-43a. */
  unexplainedTokens: number;
}

export async function summaryFor(range: Range): Promise<Summary> {
  const [totals, overall] = await Promise.all([
    db
      .select({
        currency: sql<string>`coalesce(${aiUsage.currency}, '')`,
        costMicros: sql<string>`coalesce(sum(${aiUsage.costMicros}), 0)`,
        calls: sql<number>`count(*)::int`,
      })
      .from(aiUsage)
      // Only priced rows carry a cost, so this is exactly the set the totals
      // are true for. The unpriced ones are counted below rather than folded in
      // at zero, which would understate the month by however many they are.
      .where(and(within(range), sql`${aiUsage.costMicros} is not null`))
      .groupBy(sql`coalesce(${aiUsage.currency}, '')`)
      .orderBy(sql`coalesce(${aiUsage.currency}, '')`),

    db
      .select({
        calls: sql<number>`count(*)::int`,
        inputTokens: sql<string>`coalesce(sum(${aiUsage.inputTokens}), 0)`,
        outputTokens: sql<string>`coalesce(sum(${aiUsage.outputTokens}), 0)`,
        cachedInputTokens: sql<string>`coalesce(sum(${aiUsage.cachedInputTokens}), 0)`,
        unpricedCalls: sql<number>`count(*) filter (where ${aiUsage.costMicros} is null)::int`,
        failedCalls: sql<number>`count(*) filter (where ${aiUsage.outcome} <> 'ok')::int`,
        unexplainedTokens: sql<string>`coalesce(sum(${aiUsage.unexplainedTokens}), 0)`,
      })
      .from(aiUsage)
      .where(within(range)),
  ]);

  const row = overall[0];
  return {
    totals: totals.map((t) => ({
      currency: t.currency,
      costMicros: num(t.costMicros),
      calls: num(t.calls),
    })),
    calls: num(row?.calls),
    inputTokens: num(row?.inputTokens),
    outputTokens: num(row?.outputTokens),
    cachedInputTokens: num(row?.cachedInputTokens),
    unpricedCalls: num(row?.unpricedCalls),
    failedCalls: num(row?.failedCalls),
    unexplainedTokens: num(row?.unexplainedTokens),
  };
}

export interface GroupRow {
  /** The time bucket, or "" when the view is not grouped over time. */
  bucket: string;
  /** The task, or `provider/model` — "" when no dimension is chosen. */
  key: string;
  currency: string;
  /** Null when nothing in this group could be priced. Never 0 for that. */
  costMicros: number | null;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  unpricedCalls: number;
}

/**
 * Spend, sliced.
 *
 * **Currency is always part of the grouping**, whatever else is. So a row can
 * never be a sum across two of them, and the page cannot add one by accident.
 * That is enforced here rather than left to the caller, because the caller is a
 * page and pages get edited.
 */
export async function groupedFor(
  range: Range,
  dimension: Dimension,
  granularity: Granularity,
  timeZone: string,
): Promise<GroupRow[]> {
  const bucket = granularity === "none" ? sql<string>`''` : bucketExpr(granularity, timeZone);
  const key =
    dimension === "task"
      ? sql<string>`${aiUsage.task}`
      : dimension === "model"
        ? sql<string>`${aiUsage.provider} || '/' || ${aiUsage.model}`
        : sql<string>`''`;
  const currency = sql<string>`coalesce(${aiUsage.currency}, '')`;

  // ── Why GROUP BY takes ordinals rather than the expressions ──────────────
  // Repeating `date_trunc($1, … at time zone $2)` in GROUP BY does not work:
  // Drizzle emits a fresh placeholder for each occurrence, and Postgres cannot
  // prove `$1` equals `$5`, so it refuses with "created_at must appear in the
  // GROUP BY clause". Ordinals refer to the select list itself, which sidesteps
  // the question — and they are the only form that also handles the second
  // problem below.
  //
  // The constant columns are selected but never grouped or ordered by. A
  // literal in ORDER BY is a syntax error of its own ("non-integer constant in
  // ORDER BY"), and it would only fire on the two "none" views — the kind of
  // break that typechecks, passes a smoke test that never gets past the login
  // redirect, and is found by an Operator.
  //
  // Positions are fixed by the select list below: 1 bucket, 2 key, 3 currency.
  const positions = [
    ...(granularity === "none" ? [] : [1]),
    ...(dimension === "none" ? [] : [2]),
    3,
  ].map((n) => sql.raw(String(n)));

  const rows = await db
    .select({
      bucket,
      key,
      currency,
      // `sum()` over an all-null group is null, which is exactly the answer:
      // nothing here could be priced. `coalesce(…, 0)` would call it free.
      costMicros: sql<string | null>`sum(${aiUsage.costMicros})`,
      calls: sql<number>`count(*)::int`,
      inputTokens: sql<string>`coalesce(sum(${aiUsage.inputTokens}), 0)`,
      outputTokens: sql<string>`coalesce(sum(${aiUsage.outputTokens}), 0)`,
      unpricedCalls: sql<number>`count(*) filter (where ${aiUsage.costMicros} is null)::int`,
    })
    .from(aiUsage)
    .where(within(range))
    .groupBy(...positions)
    .orderBy(...positions);

  return rows.map((row) => ({
    bucket: row.bucket,
    key: row.key,
    currency: row.currency,
    costMicros: row.costMicros === null ? null : num(row.costMicros),
    calls: num(row.calls),
    inputTokens: num(row.inputTokens),
    outputTokens: num(row.outputTokens),
    unpricedCalls: num(row.unpricedCalls),
  }));
}

export interface CallRow {
  id: string;
  task: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  costMicros: number | null;
  currency: string | null;
  costSource: string;
  usageReported: boolean;
  outcome: string;
  latencyMs: number;
  createdAt: Date;
}

/** How many individual calls the page shows at most. */
export const CALLS_LIMIT = 50;

/**
 * The individual calls behind the numbers, newest first.
 *
 * Capped, because this is the first table in the app that grows with USAGE
 * rather than with customers, and an Operator page must not try to render a
 * year of it. The caller is told when the cap was hit (`length === limit`) so
 * it can say so rather than present a slice as the whole story.
 *
 * There is no prompt and no answer here because the table holds none — that is
 * structural, not a choice made at this query (`docs/data-protection.md` §10).
 */
export async function callsFor(
  range: Range,
  focus: CallFocus = {},
  granularity: Granularity = "none",
  timeZone = "UTC",
  limit = CALLS_LIMIT,
): Promise<CallRow[]> {
  // Every term is a bound parameter, so a task id out of a query string is
  // matched, never interpolated.
  const conditions = [
    within(range),
    focus.task ? eq(aiUsage.task, focus.task) : undefined,
    focus.model
      ? sql`${aiUsage.provider} || '/' || ${aiUsage.model} = ${focus.model}`
      : undefined,
    // A bucket only means something at a granularity. Without one the link
    // cannot have carried a bucket either, so this drops out on its own.
    focus.bucket && granularity !== "none"
      ? sql`${bucketExpr(granularity, timeZone)} = ${focus.bucket}`
      : undefined,
  ].filter(Boolean);

  return db
    .select({
      id: aiUsage.id,
      task: aiUsage.task,
      provider: aiUsage.provider,
      model: aiUsage.model,
      inputTokens: aiUsage.inputTokens,
      outputTokens: aiUsage.outputTokens,
      cachedInputTokens: aiUsage.cachedInputTokens,
      costMicros: aiUsage.costMicros,
      currency: aiUsage.currency,
      costSource: aiUsage.costSource,
      usageReported: aiUsage.usageReported,
      outcome: aiUsage.outcome,
      latencyMs: aiUsage.latencyMs,
      createdAt: aiUsage.createdAt,
    })
    .from(aiUsage)
    .where(and(...conditions))
    // The id breaks ties: two rows written in the same millisecond would
    // otherwise come back in whatever order the planner felt like, and a list
    // that reshuffles on reload looks broken.
    .orderBy(desc(aiUsage.createdAt), desc(aiUsage.id))
    .limit(Math.max(1, Math.trunc(limit)));
}

export interface ModelCount {
  /** `provider/model`. */
  key: string;
  calls: number;
  tokens: number;
}

/** Which models the report could not price, and how often they were called. */
export async function unpricedModels(range: Range): Promise<ModelCount[]> {
  const key = sql<string>`${aiUsage.provider} || '/' || ${aiUsage.model}`;
  const rows = await db
    .select({
      key,
      calls: sql<number>`count(*)::int`,
      tokens: sql<string>`coalesce(sum(${aiUsage.inputTokens} + ${aiUsage.outputTokens}), 0)`,
    })
    .from(aiUsage)
    .where(and(within(range), sql`${aiUsage.costMicros} is null`))
    .groupBy(key)
    .orderBy(desc(sql`count(*)`));
  return rows.map((r) => ({ key: r.key, calls: num(r.calls), tokens: num(r.tokens) }));
}

/** Which models were billed for tokens they did not itemise (FR-43a). */
export async function unexplainedModels(range: Range): Promise<ModelCount[]> {
  const key = sql<string>`${aiUsage.provider} || '/' || ${aiUsage.model}`;
  const rows = await db
    .select({
      key,
      calls: sql<number>`count(*)::int`,
      tokens: sql<string>`coalesce(sum(${aiUsage.unexplainedTokens}), 0)`,
    })
    .from(aiUsage)
    .where(and(within(range), sql`${aiUsage.unexplainedTokens} > 0`))
    .groupBy(key)
    .orderBy(desc(sql`sum(${aiUsage.unexplainedTokens})`));
  return rows.map((r) => ({ key: r.key, calls: num(r.calls), tokens: num(r.tokens) }));
}

export interface OutcomeCount {
  outcome: string;
  calls: number;
}

/** What went wrong, and how often. Kept beside the spend, never mixed into it. */
export async function failuresFor(range: Range): Promise<OutcomeCount[]> {
  const rows = await db
    .select({ outcome: aiUsage.outcome, calls: sql<number>`count(*)::int` })
    .from(aiUsage)
    .where(and(within(range), sql`${aiUsage.outcome} <> 'ok'`))
    .groupBy(aiUsage.outcome)
    .orderBy(desc(sql`count(*)`));
  return rows.map((r) => ({ outcome: r.outcome, calls: num(r.calls) }));
}

export interface Report {
  view: ReportView;
  focus: CallFocus;
  range: Range;
  timeZone: string;
  summary: Summary;
  groups: GroupRow[];
  buckets: string[];
  calls: CallRow[];
  callsCapped: boolean;
  unpriced: ModelCount[];
  unexplained: ModelCount[];
  failures: OutcomeCount[];
}

/** Everything the page shows, in one round of parallel queries. */
export async function reportFor(
  view: ReportView,
  focus: CallFocus,
  now: Date,
): Promise<Report> {
  const timeZone = appTimeZone();
  const range = rangeFor(view.period, now, timeZone);

  const [summary, groups, calls, unpriced, unexplained, failures] = await Promise.all([
    summaryFor(range),
    groupedFor(range, view.dimension, view.granularity, timeZone),
    // The ONLY query the focus narrows. Everything else on the page stays the
    // truth about the whole period, so a figure quoted from it keeps meaning
    // the same thing after somebody clicks into a day.
    callsFor(range, focus, view.granularity, timeZone),
    unpricedModels(range),
    unexplainedModels(range),
    failuresFor(range),
  ]);

  return {
    view,
    focus,
    range,
    timeZone,
    summary,
    groups,
    buckets: bucketLabels(range, view.granularity, timeZone),
    calls,
    callsCapped: calls.length >= CALLS_LIMIT,
    unpriced,
    unexplained,
    failures,
  };
}

// ── Pure: shaping the rows for the table ────────────────────────────────────

export interface TableRow extends GroupRow {
  /** True when the bucket produced no rows at all and this one was filled in. */
  empty: boolean;
}

/**
 * The grouped rows with the missing buckets put back.
 *
 * The query cannot return a row for a day nobody called anything, and a table
 * that skips it says "quiet" where the truth is "nothing recorded". So every
 * bucket the period contains gets a row, and one that had no calls is marked as
 * such rather than shown as a zero indistinguishable from a real one.
 */
export function withEmptyBuckets(rows: GroupRow[], buckets: string[]): TableRow[] {
  const filled: TableRow[] = rows.map((row) => ({ ...row, empty: false }));
  if (buckets.length === 0) return filled;

  const present = new Set(rows.map((row) => row.bucket));
  for (const bucket of buckets) {
    if (present.has(bucket)) continue;
    filled.push({
      bucket,
      key: "",
      currency: "",
      costMicros: null,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      unpricedCalls: 0,
      empty: true,
    });
  }
  return filled.sort((a, b) => a.bucket.localeCompare(b.bucket) || a.key.localeCompare(b.key));
}

/**
 * What share of input tokens was served from cache, as a percentage.
 *
 * The one number on the page that is a health check rather than an accounting
 * figure: a prompt whose stable prefix has been broken still answers correctly
 * and costs roughly ten times as much, and this is the only place it shows.
 * Null when there was no input at all — 0% would read as a collapsed cache.
 */
export function cacheShare(summary: Summary): number | null {
  if (summary.inputTokens <= 0) return null;
  return (summary.cachedInputTokens / summary.inputTokens) * 100;
}
