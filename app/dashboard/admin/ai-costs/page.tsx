// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { getFormatter, getTranslations } from "next-intl/server";

import { requireOwner } from "@/lib/authz";
import { parseFocus, parseView, reportFor, type ReportView } from "@/lib/ai/report";
import { pricesUpdatedAt } from "@/lib/ai/prices";
import { taskProblems } from "@/lib/ai/tasks";
import { PageHeader } from "@/components/page-header";
import { Calls, Filters, Gaps, Groups, NoCalls, Totals } from "./ui";

export async function generateMetadata() {
  const t = await getTranslations("aiCosts");
  return { title: t("title") };
}

// KI-Kosten — what the AI layer has spent, and what the number leaves out.
//
// Reads `ai_usage` and nothing else. There is no action on this page, no form
// and no mutation: everything it needs is in the URL, so a view survives a
// reload and can be sent to somebody.
//
// ── requireOwner() is the FIRST line, and it is not decoration ─────────────
// The navigation entry is `ownerOnly`, but hiding a link is not protecting a
// page — a Member who types the address gets whatever the page renders. This is
// the whole installation's spend; it is the Operator's business and nobody
// else's.
//
// ── What is deliberately absent ───────────────────────────────────────────
// No prompt, no completion, no member column. `ai_usage` holds none of the
// first two by construction (docs/data-protection.md §10), and the third would
// turn a cost report into a per-customer behaviour log for no gain the Operator
// asked for.
export default async function AiCostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireOwner();
  // `searchParams` is a Promise in this Next.js version. Forgetting the await
  // compiles cleanly and fails on the first request.
  const params = await searchParams;
  const view: ReportView = parseView(params);
  const report = await reportFor(view, parseFocus(params), new Date());

  const t = await getTranslations("aiCosts");
  const format = await getFormatter();

  const range = `${format.dateTime(report.range.from, { dateStyle: "medium" })} – ${format.dateTime(report.range.to, { dateStyle: "medium" })}`;

  return (
    <>
      <PageHeader title={t("title")} description={t("description", { range })} />

      <div className="space-y-6">
        <Filters view={view} />

        {report.summary.calls === 0 ? (
          // Not a zero presented as a fact: an installation with no calls has
          // not spent nothing this month, it has recorded nothing — and a task
          // bound to a provider with no key on this machine is by far the most
          // likely reason, so the empty state says which it is.
          <NoCalls configured={taskProblems().length === 0} />
        ) : (
          <>
            <Totals summary={report.summary} />
            <Gaps
              unpriced={report.unpriced}
              unexplained={report.unexplained}
              failures={report.failures}
              pricesUpdated={pricesUpdatedAt()}
            />
            <Groups report={report} />
            <Calls report={report} />
          </>
        )}
      </div>
    </>
  );
}
