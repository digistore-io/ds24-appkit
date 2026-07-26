// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { getTranslations, getFormatter } from "next-intl/server";

import { requireOwner } from "@/lib/authz";
import { listImpersonations } from "@/lib/impersonation/manage";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LogIn } from "lucide-react";

export async function generateMetadata() {
  const t = await getTranslations("impersonation");
  return { title: t("title") };
}

/**
 * Every time an Operator signed in as one of their customers.
 *
 * This page is the reason the feature is defensible rather than being a
 * backdoor with a nice UI. It answers one question — *"did somebody go into my
 * account, and who?"* — and it must keep answering it, which is why it is NOT
 * hidden when `config/impersonation.json` switches the feature off: turning it
 * off does not unmake the sessions that already happened.
 *
 * It reads and writes nothing. `requireOwner()` is the first line, like every
 * admin page here.
 */
export default async function ImpersonationsPage() {
  await requireOwner();
  const rows = await listImpersonations();
  const t = await getTranslations("impersonation");
  const tCommon = await getTranslations("common");
  const format = await getFormatter();

  if (rows.length === 0) {
    return (
      <>
        <PageHeader title={t("title")} description={t("description")} />
        <EmptyState
          icon={LogIn}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>{t("columnOperator")}</TableHead>
              <TableHead>{t("columnMember")}</TableHead>
              <TableHead className="hidden sm:table-cell">
                {t("columnStarted")}
              </TableHead>
              <TableHead>{t("columnDuration")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              // Both timestamps are real columns, so Drizzle's own mapper made
              // them Dates. Neither is nullable-by-surprise: `startedAt` is
              // NOT NULL, and `endedAt` is guarded below — `format.dateTime`
              // renders 1 January 1970 for null and today for undefined, and
              // logs nothing either way.
              const running = row.endedAt === null;
              const minutes = running
                ? null
                : Math.max(
                    1,
                    Math.round(
                      (row.endedAt!.getTime() - row.startedAt.getTime()) / 60_000,
                    ),
                  );

              return (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    {row.operatorEmail ?? tCommon("none")}
                  </TableCell>
                  <TableCell>{row.memberEmail ?? tCommon("none")}</TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">
                    {format.dateTime(row.startedAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </TableCell>
                  <TableCell>
                    {running ? (
                      <Badge variant="secondary">{t("running")}</Badge>
                    ) : (
                      <span className="flex flex-wrap items-center gap-2">
                        <span>{t("minutes", { count: minutes as number })}</span>
                        {row.endedBy && (
                          <span className="text-muted-foreground text-xs">
                            {t(`endedBy_${row.endedBy}` as "endedBy_operator")}
                          </span>
                        )}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* The distinction that keeps this page honest: a row the job closed says
          when the session was DUE to end, not that anybody was there until
          then. Stating it once beside the table is more use than a second
          column nobody reads. */}
      <p className="text-muted-foreground mt-4 text-sm">{t("hint")}</p>
    </>
  );
}
