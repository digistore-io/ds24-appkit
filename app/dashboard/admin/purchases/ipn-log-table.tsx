"use client";

// Read-only view of the IPN log — every IPN Digistore24 delivered, newest
// first. Diagnostic, not financial: it shows arrivals that never became an
// order (bad signature, connection test, processing error) too. Data comes
// from lib/digistore/ipn-log.ts; the row shape mirrors IpnLogRow.
import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Inbox } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { IpnResult } from "@/lib/digistore/ipn-log";

export interface IpnRow {
  id: string;
  receivedAt: Date;
  event: string | null;
  ds24OrderId: string | null;
  ds24PurchaseId: string | null;
  result: IpnResult;
  detail: string | null;
  payload: string | null;
}

// Badge intent per outcome. No "success" variant exists, so a processed IPN is
// the accent (default); the two rejections and the error are destructive.
const RESULT_VARIANT: Record<
  IpnResult,
  "default" | "secondary" | "outline" | "destructive"
> = {
  accepted: "default",
  connection_test: "secondary",
  not_configured: "outline",
  invalid_signature: "destructive",
  error: "destructive",
};

// The raw body is application/x-www-form-urlencoded. Show it as decoded
// key = value lines, sorted — far easier to scan than one long query string.
function decodePayload(payload: string): [string, string][] {
  return [...new URLSearchParams(payload)].sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
  );
}

export function IpnLogTable({ rows }: { rows: IpnRow[] }) {
  const t = useTranslations("purchases");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const [selected, setSelected] = useState<IpnRow | null>(null);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title={t("ipnEmptyTitle")}
        description={t("ipnEmptyBody")}
      />
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>{t("ipnColumnTime")}</TableHead>
              <TableHead>{t("ipnColumnEvent")}</TableHead>
              <TableHead className="hidden sm:table-cell">
                {t("ipnColumnOrder")}
              </TableHead>
              <TableHead className="hidden md:table-cell">
                {t("ipnColumnPurchase")}
              </TableHead>
              <TableHead className="text-right">
                {t("ipnColumnResult")}
              </TableHead>
              <TableHead className="w-12 text-right">
                <span className="sr-only">{tCommon("actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {format.dateTime(row.receivedAt, {
                    dateStyle: "short",
                    timeStyle: "medium",
                  })}
                </TableCell>
                <TableCell className="font-medium">
                  {row.event || tCommon("none")}
                  {row.detail && (
                    <span className="text-muted-foreground block text-xs font-normal">
                      {row.detail}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground hidden font-mono text-xs sm:table-cell">
                  {row.ds24OrderId ?? tCommon("none")}
                </TableCell>
                <TableCell className="text-muted-foreground hidden font-mono text-xs md:table-cell">
                  {row.ds24PurchaseId ?? tCommon("none")}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant={RESULT_VARIANT[row.result]}>
                    {t(`ipnResult_${row.result}`)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {row.payload && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelected(row)}
                    >
                      {t("ipnDetails")}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("ipnDetailsTitle")}</DialogTitle>
            <DialogDescription>{t("ipnDetailsHint")}</DialogDescription>
          </DialogHeader>
          {selected?.payload && (
            <div className="max-h-[60vh] overflow-auto rounded-lg border">
              <Table>
                <TableBody>
                  {decodePayload(selected.payload).map(([key, value]) => (
                    <TableRow key={key}>
                      <TableCell className="text-muted-foreground align-top font-mono text-xs whitespace-nowrap">
                        {key}
                      </TableCell>
                      <TableCell className="font-mono text-xs break-all">
                        {value}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
