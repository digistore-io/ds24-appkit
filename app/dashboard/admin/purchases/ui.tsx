"use client";

// Presentation for the unattributed-purchases screen. All logic lives in the
// server action; this is the table plus useActionState for the pending state,
// following app/dashboard/admin/users/ui.tsx as the blueprint.
import { useActionState, useEffect, useState, useTransition } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Receipt } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useActionToast } from "@/hooks/use-action-toast";
import { attachOrderAction, type ActionState } from "./actions";

const EMPTY: ActionState = { error: null, ok: null };

export interface Row {
  ds24OrderId: string;
  buyerEmail: string | null;
  productKey: string | null;
  amount: string | null;
  currency: string | null;
  createdAt: Date;
}

export function UnattributedTable({
  rows,
  members,
}: {
  rows: Row[];
  members: { id: string; email: string | null }[];
}) {
  const t = useTranslations("purchases");
  const tCommon = useTranslations("common");
  const format = useFormatter();

  const [state, action] = useActionState(attachOrderAction, EMPTY);
  const [isPending, startAction] = useTransition();
  const [toAttach, setToAttach] = useState<Row | null>(null);
  const [memberId, setMemberId] = useState("");

  useActionToast(state);

  // Close only on success — a refused attach leaves the dialog open with the
  // toast explaining why.
  useEffect(() => {
    if (state.ok) {
      setToAttach(null);
      setMemberId("");
    }
  }, [state.ok]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title={t("emptyTitle")}
        description={t("emptyBody")}
      />
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>{t("columnBuyer")}</TableHead>
              <TableHead className="hidden sm:table-cell">
                {t("columnProduct")}
              </TableHead>
              <TableHead className="hidden sm:table-cell">
                {t("columnAmount")}
              </TableHead>
              <TableHead className="hidden md:table-cell">
                {t("columnDate")}
              </TableHead>
              <TableHead className="w-12 text-right">
                <span className="sr-only">{tCommon("actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.ds24OrderId}>
                <TableCell className="font-medium">
                  {row.buyerEmail ?? tCommon("none")}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {row.productKey ?? tCommon("none")}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {row.amount ? `${row.amount} ${row.currency ?? ""}`.trim() : tCommon("none")}
                </TableCell>
                <TableCell className="text-muted-foreground hidden md:table-cell">
                  {format.dateTime(row.createdAt, { dateStyle: "medium" })}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => setToAttach(row)}
                  >
                    {t("attach")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={toAttach !== null}
        onOpenChange={(open) => !open && setToAttach(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("attachTitle", { email: toAttach?.buyerEmail ?? tCommon("none") })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("attachDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="attach-member">{t("attachMember")}</Label>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger id="attach-member">
                <SelectValue placeholder={t("attachMemberPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.email ?? m.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending || !memberId}
              onClick={(event) => {
                // Do not close the dialog here — a refusal must stay visible.
                event.preventDefault();
                if (!toAttach || !memberId) return;
                const formData = new FormData();
                formData.set("orderId", toAttach.ds24OrderId);
                formData.set("memberId", memberId);
                startAction(() => action(formData));
              }}
            >
              {isPending ? tCommon("loading") : t("attachConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
