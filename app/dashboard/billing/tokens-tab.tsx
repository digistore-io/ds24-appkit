// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

"use client";

// The Member's own token journal — balance on top, bookings below.
//
// The Operator has the same journal on /dashboard/admin/users/<id>, and this is
// deliberately NOT that component: theirs renders the `note` an Operator typed
// about the customer, plus who typed it. Here the rows arrive from
// `listOwnLedger` already stripped — there is no `note` on this shape at all,
// only a `label` that exists for consume rows. See lib/tokens/own-ledger.ts and
// lib/entitlements/leak-guard.test.ts, which enforces it on this file.
import { Coins } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useActionState } from "react";

import { useActionToast } from "@/hooks/use-action-toast";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { OwnLedgerRow } from "@/lib/tokens/own-ledger";
import { type AutoReloadState } from "./actions";

/**
 * Nothing has happened yet.
 *
 * Here rather than in `./actions`: that file is `"use server"`, and such a file
 * may export async functions ONLY — a constant there breaks `npm run build`
 * while every test and `next dev` stay green. Same shape and same place as the
 * `EMPTY` in `app/dashboard/account/ui.tsx`.
 */
const EMPTY_AUTO_RELOAD: AutoReloadState = { error: null, ok: null };

/** All four kinds get a label — including `refund`, which nothing writes yet. */
const KIND_LABEL: Record<OwnLedgerRow["type"], string> = {
  topup: "kindTopup",
  consume: "kindConsume",
  refund: "kindRefund",
  adjust: "kindAdjust",
};

export function TokensTab({
  balance,
  rows,
  truncated,
  limit,
  autoReload,
  onDisableAutoReload,
  onEnableAutoReload,
}: {
  balance: number;
  rows: OwnLedgerRow[];
  /** The read hit its cap — say so rather than pass a slice off as everything. */
  truncated: boolean;
  limit: number;
  /** `null` when this Member has never armed it. */
  autoReload: {
    enabled: boolean;
    threshold: number;
    packageName: string | null;
    price: string | null;
  } | null;
  onDisableAutoReload: (state: AutoReloadState) => Promise<AutoReloadState>;
  onEnableAutoReload: (state: AutoReloadState) => Promise<AutoReloadState>;
}) {
  const t = useTranslations("billing");
  const format = useFormatter();
  // Every action reports back (CLAUDE.md -> UI). This one revokes a recurring
  // card charge; "the callout quietly disappeared" is not a confirmation.
  const [offState, disable, offPending] = useActionState(
    onDisableAutoReload,
    EMPTY_AUTO_RELOAD,
  );
  const [onState, enable, onPending] = useActionState(
    onEnableAutoReload,
    EMPTY_AUTO_RELOAD,
  );
  useActionToast(offState);
  useActionToast(onState);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-1">
          <CardDescription>{t("tokensBalanceTitle")}</CardDescription>
          <CardTitle className="text-3xl tabular-nums">
            {format.number(balance)}
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            {t("tokensBalanceHint")}
          </p>
        </CardContent>
      </Card>

      {autoReload && (
        // Stays on screen — it is a STATE, not the result of an action, so a
        // Callout rather than a toast (CLAUDE.md -> UI). The toast reports the
        // switch; the callout reports the standing arrangement.
        <Callout
          variant={autoReload.enabled ? "info" : "warning"}
          title={
            autoReload.enabled ? t("autoReloadOnTitle") : t("autoReloadOffTitle")
          }
        >
          <div className="flex flex-col items-start gap-3">
            <p>
              {autoReload.enabled
                ? autoReload.packageName
                  ? t("autoReloadOnBody", {
                      threshold: autoReload.threshold,
                      package: autoReload.packageName,
                      // The amount that will be charged. A recurring unattended
                      // charge whose confirmation never names a price is a
                      // support case at best.
                      price: autoReload.price ?? t("autoReloadPriceUnknown"),
                    })
                  : t("autoReloadOnBodyUnknownPackage", {
                      threshold: autoReload.threshold,
                    })
                : t("autoReloadOffBody", {
                    package: autoReload.packageName ?? t("autoReloadPackageGone"),
                  })}
            </p>
            {/* Plain forms, so both work before hydration. Turning OFF an
                unattended card charge must not depend on JavaScript. */}
            {autoReload.enabled ? (
              <form action={disable}>
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={offPending}
                >
                  {t("autoReloadDisable")}
                </Button>
              </form>
            ) : (
              <form action={enable}>
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={onPending}
                >
                  {t("autoReloadEnable")}
                </Button>
              </form>
            )}
          </div>
        </Callout>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("tokensLedgerTitle")}</h2>

        {truncated && (
          <Callout variant="info" title={t("tokensTruncatedTitle")}>
            {t("tokensTruncatedBody", { limit })}
          </Callout>
        )}

        {rows.length === 0 ? (
          <EmptyState
            icon={Coins}
            title={t("tokensEmptyTitle")}
            description={t("tokensEmptyBody")}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>{t("tokensColumnDate")}</TableHead>
                  <TableHead>{t("tokensColumnKind")}</TableHead>
                  <TableHead className="text-right">
                    {t("tokensColumnAmount")}
                  </TableHead>
                  <TableHead className="hidden text-right sm:table-cell">
                    {t("tokensColumnBalance")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {format.dateTime(row.createdAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{t(KIND_LABEL[row.type] ?? "kindOther")}</span>
                        {/* What the app charged for — present on consume rows
                            only. An Operator's reason never reaches this
                            shape; own-ledger.ts drops it. */}
                        {row.label && (
                          <span className="text-muted-foreground text-xs">
                            {row.label}
                          </span>
                        )}
                        {/* "auto" tells the Member this top-up was charged
                            without them pressing anything — the one origin
                            worth surfacing on their own page. */}
                        {row.origin === "auto" && (
                          <span className="text-muted-foreground text-xs">
                            {t("tokensOriginAuto")}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular-nums",
                        row.amount > 0 && "text-success-foreground",
                        row.amount < 0 && "text-danger-foreground",
                      )}
                    >
                      {/* The sign is the point of a journal — a bare "50"
                          could be a credit or a spend. */}
                      {format.number(row.amount, { signDisplay: "exceptZero" })}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {format.number(row.balanceAfter)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
