// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

"use client";

// Client components of the Member's own account page — the sign-in section.
//
// The logic lives in the server actions (actions.ts); this is presentation plus
// useActionState for the pending state, with feedback through `useActionToast`,
// exactly as the admin screens do it.
//
// Why removing a password uses a Dialog and not an AlertDialog: an AlertDialog
// confirms, and confirming is not enough here — removal requires typing the
// current password, which is a stronger gate than any "are you sure?" and needs
// a field to type it into. The button inside is still `destructive`, and the
// text names what stops working. Removal is also genuinely reversible (set one
// again) and takes no access away, since the magic link never went anywhere.

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { KeyRound, Mail, ShieldCheck, ShieldOff } from "lucide-react";

import { useActionToast } from "@/hooks/use-action-toast";
import {
  setPasswordAction,
  removePasswordAction,
  requestEmailChangeAction,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const EMPTY = { error: null, ok: null };

export function SignInCard({
  email,
  hasPassword,
  minLength,
  pending,
  mailConfigured,
}: {
  email: string;
  hasPassword: boolean;
  minLength: number;
  /** A requested-but-unconfirmed move, or null. */
  pending: { newEmail: string; expiresAt: string } | null;
  /**
   * Whether a mail transport exists. The address change is impossible without
   * one — the confirmation link is the entire mechanism — so the action is not
   * offered rather than offered and failing. The password below is unaffected:
   * it needs no mail at all.
   */
  mailConfigured: boolean;
}) {
  const t = useTranslations("account");

  return (
    <Card>
      <CardContent className="flex flex-col gap-6">
        <div>
          <CardTitle className="flex items-center gap-2">
            <KeyRound aria-hidden className="size-4" />
            {t("signInTitle")}
          </CardTitle>
          <CardDescription className="mt-1">
            {t("signInDescription")}
          </CardDescription>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Mail aria-hidden className="text-muted-foreground mt-0.5 size-4" />
            <div>
              <p className="text-sm font-medium">{t("emailLabel")}</p>
              <p className="text-muted-foreground text-sm break-all">{email}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {t("emailHint")}
              </p>
            </div>
          </div>
          {mailConfigured ? (
            <ChangeEmailDialog hasPending={Boolean(pending)} />
          ) : (
            // No transport, so no link, so no change is possible. Saying that
            // beats a button that accepts the click and then fails: the Member
            // would be left reading an error about something they did nothing
            // wrong in. Only reachable on a DEV machine — STAGING and PROD
            // refuse to start without mail delivery.
            <p className="text-muted-foreground max-w-xs shrink-0 text-sm">
              {t("emailChangeNoMail")}
            </p>
          )}
        </div>

        {/* A change stuck on a typo has to be VISIBLE, or the Member waits for
            a mail that went to an address that does not exist. Requesting again
            replaces this one — which is why there is no cancel button. */}
        {pending && (
          <Callout variant="info" title={t("pendingTitle")}>
            {t("pendingBody", {
              email: pending.newEmail,
              until: pending.expiresAt,
            })}
          </Callout>
        )}

        <div className="flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            {hasPassword ? (
              <ShieldCheck
                aria-hidden
                className="text-muted-foreground mt-0.5 size-4"
              />
            ) : (
              <ShieldOff
                aria-hidden
                className="text-muted-foreground mt-0.5 size-4"
              />
            )}
            <div>
              <p className="flex items-center gap-2 text-sm font-medium">
                {t("passwordLabel")}
                <Badge variant={hasPassword ? "default" : "secondary"}>
                  {hasPassword ? t("passwordSet") : t("passwordUnset")}
                </Badge>
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {hasPassword ? t("passwordSetHint") : t("passwordUnsetHint")}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            <SetPasswordDialog
              hasPassword={hasPassword}
              minLength={minLength}
            />
            {hasPassword && <RemovePasswordDialog />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChangeEmailDialog({ hasPending }: { hasPending: boolean }) {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    requestEmailChangeAction,
    EMPTY,
  );
  useActionToast(state);
  useCloseOnSuccess(state.ok, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="shrink-0">
          {hasPending ? t("emailChangeAgain") : t("emailChange")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={action} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("emailChange")}</DialogTitle>
            <DialogDescription>{t("emailChangeHint")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="new-email">{t("emailNew")}</Label>
            <Input
              id="new-email"
              name="email"
              type="email"
              required
              autoComplete="email"
            />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {tCommon("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {t("emailChangeSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Closes the dialog once the action reports success. */
function useCloseOnSuccess(ok: string | null, close: () => void) {
  const previous = useRef(ok);
  useEffect(() => {
    if (ok && ok !== previous.current) close();
    previous.current = ok;
  }, [ok, close]);
}

function SetPasswordDialog({
  hasPassword,
  minLength,
}: {
  hasPassword: boolean;
  minLength: number;
}) {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(setPasswordAction, EMPTY);
  useActionToast(state);
  useCloseOnSuccess(state.ok, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={hasPassword ? "outline" : "default"}>
          {hasPassword ? t("passwordChange") : t("passwordCreate")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={action} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {hasPassword ? t("passwordChange") : t("passwordCreate")}
            </DialogTitle>
            <DialogDescription>
              {t("passwordDialogHint", { min: minLength })}
            </DialogDescription>
          </DialogHeader>

          {/* Only asked for when one exists. The server decides this from the
              database as well — a form that lied about it would otherwise be a
              way to skip proving the current password. */}
          {hasPassword && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="current">{t("passwordCurrent")}</Label>
              <Input
                id="current"
                name="current"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t("passwordNew")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={minLength}
              autoComplete="new-password"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmation">{t("passwordConfirm")}</Label>
            <Input
              id="confirmation"
              name="confirmation"
              type="password"
              required
              minLength={minLength}
              autoComplete="new-password"
            />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {tCommon("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {t("passwordSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemovePasswordDialog() {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(removePasswordAction, EMPTY);
  useActionToast(state);
  useCloseOnSuccess(state.ok, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{t("passwordRemove")}</Button>
      </DialogTrigger>
      <DialogContent>
        <form action={action} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("passwordRemove")}</DialogTitle>
            <DialogDescription>{t("passwordRemoveHint")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="remove-current">{t("passwordCurrent")}</Label>
            <Input
              id="remove-current"
              name="current"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {tCommon("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={pending}>
              {t("passwordRemoveSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
