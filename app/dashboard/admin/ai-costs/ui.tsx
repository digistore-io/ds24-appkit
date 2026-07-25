// The KI-Kosten page, rendered.
//
// Server components throughout — there is nothing interactive here. Every
// control is a link that changes the query string, so the view survives a
// reload, a bookmark and a copied link, and the whole page stays out of the
// browser bundle. `app/dashboard/admin/purchases` uses the same idea with its
// filters.
//
// Two rules this file exists to keep visible:
//
//  - **Every figure names its currency.** `money()` cannot render one without.
//  - **Nothing is summed across currencies.** The data layer groups by currency,
//    and nothing here re-adds it. A total made of euros and dollars would be a
//    wrong number that looks right.
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { AlertTriangle, ChevronRight, Coins, ListTree } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  cacheShare,
  withEmptyBuckets,
  DIMENSIONS,
  GRANULARITIES,
  PERIODS,
  type CallFocus,
  type ModelCount,
  type OutcomeCount,
  type Report,
  type ReportView,
  type Summary,
} from "@/lib/ai/report";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ── Formatting ──────────────────────────────────────────────────────────────

/**
 * Money, with its currency spelled out.
 *
 * Deliberately NOT `Intl.NumberFormat`'s `style: "currency"`: the code comes
 * from the Operator's own price file, and an unknown one makes that constructor
 * throw — a cost page that crashes because somebody typed "EURO" is worse than
 * one that prints "EURO" beside the number.
 *
 * Four decimals below one unit, because a single call routinely costs 0.0021
 * and rounding it to 0.00 makes the per-call view useless.
 */
function money(micros: number | null, currency: string, locale: string): string {
  if (micros === null) return "—";
  const value = micros / 1_000_000;
  const digits = Math.abs(value) < 1 ? 4 : 2;
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
  return currency ? `${number} ${currency}` : number;
}

function count(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** A percentage in the reader's own notation — "88,4 %" in German, not "88.4". */
function percent(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100);
}

/** A bucket label ("2026-07-25") as a date. Read as UTC — it is a plain date. */
function bucketDate(bucket: string): Date {
  return new Date(`${bucket}T00:00:00.000Z`);
}

/**
 * A short operator-facing label for an outcome.
 *
 * Not the sentences in the `errors` namespace: those are written for a Member
 * mid-conversation ("please try again in a few minutes") and are useless in a
 * table cell. An unrecognised code falls back to itself rather than to a
 * rendering error — `outcome` is a free-text column, and a future provider
 * error code must not take the cost page down.
 */
function outcomeLabel(
  outcome: string,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  const key = `outcome_${outcome}`;
  return t.has(key) ? t(key) : outcome;
}

// ── The controls ────────────────────────────────────────────────────────────

/**
 * A link to the same page with something changed.
 *
 * Changing the view DROPS the focus, deliberately: "the calls in the chat task
 * on 22 July" stops meaning anything the moment you regroup by model, and a
 * focus that survived would silently filter a list nobody asked it to.
 */
function hrefFor(
  view: ReportView,
  patch: Partial<ReportView>,
  focus: CallFocus = {},
): string {
  const next = { ...view, ...patch };
  const params = new URLSearchParams({
    period: next.period,
    by: next.dimension,
    over: next.granularity,
  });
  for (const [key, value] of Object.entries(focus)) {
    if (value) params.set(key, value);
  }
  return `/dashboard/admin/ai-costs?${params.toString()}`;
}

function Switcher({
  label,
  view,
  field,
  options,
  labelFor,
}: {
  label: string;
  view: ReportView;
  field: keyof ReportView;
  options: readonly string[];
  labelFor: (value: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-sm">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => {
          const active = view[field] === option;
          return (
            <Button
              key={option}
              asChild
              size="sm"
              variant={active ? "default" : "outline"}
            >
              <Link
                href={hrefFor(view, { [field]: option } as Partial<ReportView>)}
                aria-current={active ? "page" : undefined}
              >
                {labelFor(option)}
              </Link>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export async function Filters({ view }: { view: ReportView }) {
  const t = await getTranslations("aiCosts");
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <Switcher
        label={t("periodLabel")}
        view={view}
        field="period"
        options={PERIODS}
        labelFor={(value) => t(`period_${value}`)}
      />
      <Switcher
        label={t("byLabel")}
        view={view}
        field="dimension"
        options={DIMENSIONS}
        labelFor={(value) => t(`by_${value}`)}
      />
      <Switcher
        label={t("overLabel")}
        view={view}
        field="granularity"
        options={GRANULARITIES}
        labelFor={(value) => t(`over_${value}`)}
      />
    </div>
  );
}

// ── The headline ────────────────────────────────────────────────────────────

export async function Totals({ summary }: { summary: Summary }) {
  const t = await getTranslations("aiCosts");
  const locale = await getLocale();
  const share = cacheShare(summary);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-sm font-medium">
            {t("totalTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {summary.totals.length === 0 ? (
            <p className="text-2xl font-semibold tabular-nums">—</p>
          ) : (
            // One line per currency. Never one number: see lib/ai/report.ts.
            summary.totals.map((total) => (
              <p key={total.currency} className="text-2xl font-semibold tabular-nums">
                {money(total.costMicros, total.currency, locale)}
              </p>
            ))
          )}
          {summary.unpricedCalls > 0 && (
            <p className="text-muted-foreground text-xs">
              {t("totalExcludes", { count: summary.unpricedCalls })}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-sm font-medium">
            {t("callsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">
            {count(summary.calls, locale)}
          </p>
          {summary.failedCalls > 0 && (
            <p className="text-muted-foreground text-xs">
              {t("callsFailed", { count: summary.failedCalls })}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-sm font-medium">
            {t("tokensTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">
            {count(summary.inputTokens + summary.outputTokens, locale)}
          </p>
          <p className="text-muted-foreground text-xs">
            {t("tokensSplit", {
              input: count(summary.inputTokens, locale),
              output: count(summary.outputTokens, locale),
            })}
          </p>
        </CardContent>
      </Card>

      {/* Not an accounting figure — a health check. A prompt whose stable
          prefix has been broken still answers correctly and costs roughly ten
          times as much, and this is the only place that shows. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-sm font-medium">
            {t("cacheTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">
            {share === null ? "—" : percent(share, locale)}
          </p>
          <p className="text-muted-foreground text-xs">
            {share === null ? t("cacheNone") : t("cacheHint")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── What the report cannot say (story 7.3) ──────────────────────────────────

export async function Gaps({
  unpriced,
  unexplained,
  failures,
  pricesUpdated,
}: {
  unpriced: ModelCount[];
  unexplained: ModelCount[];
  failures: OutcomeCount[];
  pricesUpdated: string | null;
}) {
  const t = await getTranslations("aiCosts");
  const locale = await getLocale();
  const format = await getFormatter();

  const totalUnpriced = unpriced.reduce((sum, row) => sum + row.calls, 0);
  const totalUnexplained = unexplained.reduce((sum, row) => sum + row.tokens, 0);
  const totalFailed = failures.reduce((sum, row) => sum + row.calls, 0);

  return (
    <div className="space-y-3">
      {unpriced.length > 0 && (
        <Callout variant="warning" title={t("unpricedTitle", { count: totalUnpriced })}>
          <p>{t("unpricedBody")}</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {unpriced.map((row) => (
              <li key={row.key}>
                <code>{row.key}</code> —{" "}
                {t("unpricedRow", { count: row.calls, tokens: count(row.tokens, locale) })}
              </li>
            ))}
          </ul>
        </Callout>
      )}

      {unexplained.length > 0 && (
        <Callout
          variant="warning"
          title={t("unexplainedTitle", { tokens: count(totalUnexplained, locale) })}
        >
          <p>{t("unexplainedBody")}</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {unexplained.map((row) => (
              <li key={row.key}>
                <code>{row.key}</code> —{" "}
                {t("unexplainedRow", {
                  tokens: count(row.tokens, locale),
                  count: row.calls,
                })}
              </li>
            ))}
          </ul>
        </Callout>
      )}

      {failures.length > 0 && (
        <Callout variant="info" title={t("failedTitle", { count: totalFailed })}>
          <p>{t("failedBody")}</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {failures.map((row) => (
              <li key={row.outcome}>
                {/* The typed outcome, translated. A provider's own error text
                    never reaches a page — it can quote the prompt back. */}
                {outcomeLabel(row.outcome, t)} — {t("failedRow", { count: row.calls })}
              </li>
            ))}
          </ul>
        </Callout>
      )}

      <p className="text-muted-foreground text-xs">
        {pricesUpdated
          ? t("pricesUpdated", {
              date: format.dateTime(new Date(`${pricesUpdated}T00:00:00.000Z`), {
                dateStyle: "medium",
                timeZone: "UTC",
              }),
            })
          : t("pricesUnknown")}
      </p>
    </div>
  );
}

// ── The grouped table (story 7.2) ───────────────────────────────────────────

export async function Groups({ report }: { report: Report }) {
  const t = await getTranslations("aiCosts");
  const locale = await getLocale();
  const format = await getFormatter();
  const { view } = report;

  if (view.dimension === "none" && view.granularity === "none") return null;

  const rows = withEmptyBuckets(report.groups, report.buckets);
  const showBucket = view.granularity !== "none";
  const showKey = view.dimension !== "none";

  /** Where "open this group" goes — the same view, focused on this row. */
  const openHref = (row: (typeof rows)[number]) =>
    hrefFor(view, {}, {
      bucket: showBucket ? row.bucket : undefined,
      task: view.dimension === "task" ? row.key : undefined,
      model: view.dimension === "model" ? row.key : undefined,
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("groupsTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {showBucket && <TableHead>{t("colBucket")}</TableHead>}
                {showKey && (
                  <TableHead>
                    {view.dimension === "task" ? t("colTask") : t("colModel")}
                  </TableHead>
                )}
                <TableHead className="text-right">{t("colCost")}</TableHead>
                <TableHead className="text-right">{t("colCalls")}</TableHead>
                <TableHead className="text-right">{t("colInput")}</TableHead>
                <TableHead className="text-right">{t("colOutput")}</TableHead>
                <TableHead className="sr-only">{t("colOpen")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={`${row.bucket}|${row.key}|${row.currency}`}
                  className={cn(row.empty && "text-muted-foreground")}
                >
                  {showBucket && (
                    <TableCell className="whitespace-nowrap">
                      {format.dateTime(bucketDate(row.bucket), {
                        dateStyle: "medium",
                        timeZone: "UTC",
                      })}
                    </TableCell>
                  )}
                  {showKey && (
                    <TableCell className="font-mono text-xs">
                      {/* A bucket nobody called anything in is named as such,
                          rather than dropped — a missing day and a quiet day
                          look identical once the row is gone. */}
                      {row.empty ? t("noCalls") : row.key}
                    </TableCell>
                  )}
                  <TableCell className="text-right tabular-nums">
                    {money(row.costMicros, row.currency, locale)}
                    {row.unpricedCalls > 0 && !row.empty && (
                      <span className="text-muted-foreground ml-1 text-xs">
                        {t("plusUnpriced", { count: row.unpricedCalls })}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {count(row.calls, locale)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {count(row.inputTokens, locale)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {count(row.outputTokens, locale)}
                  </TableCell>
                  {/* AC 7.3: a group can be opened, and what comes back is the
                      individual calls behind it — the list below, narrowed.
                      Nothing above it moves; the totals stay the period's. */}
                  <TableCell className="text-right">
                    {!row.empty && (
                      <Button asChild size="sm" variant="ghost">
                        <Link href={openHref(row)}>
                          {t("openGroup")}
                          <ChevronRight aria-hidden />
                        </Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── The individual calls (story 7.3) ────────────────────────────────────────

function outcomeVariant(outcome: string): "secondary" | "destructive" {
  return outcome === "ok" ? "secondary" : "destructive";
}

export async function Calls({ report }: { report: Report }) {
  const t = await getTranslations("aiCosts");
  const locale = await getLocale();
  const format = await getFormatter();
  const { calls, focus, view } = report;

  // What the list is narrowed to, in the Operator's own words. Built from the
  // focus rather than from the row data, so it still reads correctly when the
  // narrowing matched nothing at all.
  const focusParts = [
    focus.task,
    focus.model,
    focus.bucket && view.granularity !== "none"
      ? format.dateTime(bucketDate(focus.bucket), { dateStyle: "medium", timeZone: "UTC" })
      : null,
  ].filter(Boolean) as string[];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>
          {focusParts.length > 0
            ? t("callsHeadingFocused", { focus: focusParts.join(" · ") })
            : t("callsHeading")}
        </CardTitle>
        {focusParts.length > 0 && (
          <Button asChild size="sm" variant="outline">
            <Link href={hrefFor(view, {})}>{t("callsShowAll")}</Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Said out loud rather than left to be inferred from a short list: a
            slice presented as the whole story is how somebody concludes their
            app made fifty calls last month. */}
        {report.callsCapped && (
          <p className="text-muted-foreground text-sm">
            {t("callsCapped", { count: calls.length })}
          </p>
        )}
        {calls.length === 0 ? (
          // Reachable: a stale link, or a focus on a group whose calls have
          // since been pruned. Saying so beats an empty table with headings.
          <p className="text-muted-foreground text-sm">{t("callsNoneInGroup")}</p>
        ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colWhen")}</TableHead>
                <TableHead>{t("colTask")}</TableHead>
                <TableHead>{t("colModel")}</TableHead>
                <TableHead className="text-right">{t("colInput")}</TableHead>
                <TableHead className="text-right">{t("colOutput")}</TableHead>
                <TableHead className="text-right">{t("colCost")}</TableHead>
                <TableHead className="text-right">{t("colLatency")}</TableHead>
                <TableHead>{t("colOutcome")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calls.map((call) => (
                <TableRow key={call.id}>
                  <TableCell className="whitespace-nowrap">
                    {format.dateTime(call.createdAt, { dateStyle: "short", timeStyle: "short" })}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{call.task}</TableCell>
                  {/* Named on EVERY row, including refused and failed ones —
                      the binding is resolved before anything can refuse, and
                      "which model" is usually the answer to "why is nothing
                      working" (AD-20). */}
                  <TableCell className="font-mono text-xs">
                    {call.provider}/{call.model}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {call.usageReported ? count(call.inputTokens, locale) : "—"}
                    {call.cachedInputTokens > 0 && (
                      <span className="text-muted-foreground ml-1 text-xs">
                        {t("ofWhichCached", { tokens: count(call.cachedInputTokens, locale) })}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {call.usageReported ? count(call.outputTokens, locale) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(call.costMicros, call.currency ?? "", locale)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {count(call.latencyMs, locale)} ms
                  </TableCell>
                  <TableCell>
                    <Badge variant={outcomeVariant(call.outcome)}>
                      {outcomeLabel(call.outcome, t)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        )}
        <p className="text-muted-foreground text-xs">{t("noContentNote")}</p>
      </CardContent>
    </Card>
  );
}

// ── Nothing recorded yet ────────────────────────────────────────────────────

export async function NoCalls({ configured }: { configured: boolean }) {
  const t = await getTranslations("aiCosts");
  return (
    <EmptyState
      icon={configured ? Coins : AlertTriangle}
      title={t("emptyTitle")}
      description={configured ? t("emptyBody") : t("emptyNoKeyBody")}
    >
      {/* No call to action when the reason is a missing key: the assistant page
          would only repeat that it is not configured, and the message above
          already names the command that says which key. */}
      {configured && (
        <Button asChild variant="outline">
          <Link href="/dashboard/chat">
            <ListTree aria-hidden />
            {t("emptyCta")}
          </Link>
        </Button>
      )}
    </EmptyState>
  );
}
