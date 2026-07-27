// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import * as React from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  progress,
  nextStep,
  shouldShowChecklist,
  type OnboardingStep,
} from "@/lib/onboarding/rules";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

// "What now?" — the first screen a paying customer sees, answered.
//
// An app that opens on an empty overview asks its customer to guess, and the
// guess they make is usually "this is broken". The checklist is the cheapest
// answer there is: three lines that say what is already done, what is not, and
// where to go next.
//
// ── HOW TO USE IT ────────────────────────────────────────────────────────────
//
// The steps belong to YOUR app. Work each one out from real state — never from
// a stored tick (lib/onboarding/rules.ts explains why at length) — and hand the
// list in:
//
//   <OnboardingChecklist
//     steps={[
//       {
//         id: "plan",
//         done: owned.length > 0,
//         title: t("planTitle"),
//         description: t("planBody"),
//         href: "/plans",
//       },
//       {
//         id: "project",
//         done: projectCount > 0,
//         title: t("projectTitle"),
//         href: "/dashboard/projects/new",
//       },
//     ]}
//   />
//
// The blueprint with the queries behind it is app/dashboard/page.tsx; the
// reasoning, and the rest of the first-run rules, are in docs/ux.md.
//
// It renders NOTHING when the list is empty or everything is done. That is the
// whole dismiss mechanism, and it is deliberate: the card leaves by being
// finished, so nobody has to build a "don't show again" that then hides an
// onboarding that became relevant again.

export interface OnboardingStepView extends OnboardingStep {
  /** One line, from `messages/*.json`. Never a hard-coded sentence. */
  title: React.ReactNode;
  /** Optional second line — what it is for, or what happens next. */
  description?: React.ReactNode;
  /** Where the step is done. Without it the step is shown but not linked. */
  href?: string;
  /** Button label. Defaults to a generic "open" from the `onboarding` texts. */
  cta?: React.ReactNode;
}

export async function OnboardingChecklist({
  steps,
  className,
}: {
  steps: OnboardingStepView[];
  className?: string;
}) {
  if (!shouldShowChecklist(steps)) return null;

  const t = await getTranslations("onboarding");
  const { done, total, percent } = progress(steps);
  const next = nextStep(steps);

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("body")}</CardDescription>

        <div className="mt-3 space-y-1.5">
          {/*
            The bar is decoration for anybody who can see it and nothing at all
            for anybody who cannot, which is why the same number is also in the
            sentence below it. role/aria-value* make it readable on its own;
            the visible text makes it readable without any of that.
          */}
          <div
            role="progressbar"
            aria-valuenow={done}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label={t("progress", { done, total })}
            className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
          >
            <div
              className="bg-primary h-full rounded-full transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            {t("progress", { done, total })}
          </p>
        </div>
      </CardHeader>

      <CardContent>
        <ol className="space-y-4">
          {steps.map((step, index) => (
            <li key={step.id} className="flex items-start gap-3">
              {/*
                The marker is a picture of the state, so it is hidden from
                assistive technology and the state is said in words below —
                a tick with no name reads as an unlabelled graphic.
              */}
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-xs font-medium",
                  step.done
                    ? "border-success-border bg-success text-success-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {step.done ? <Check className="size-3.5" /> : index + 1}
              </span>

              <div className="min-w-0 flex-1 space-y-1">
                <p
                  className={cn(
                    "text-sm font-medium",
                    step.done && "text-muted-foreground",
                  )}
                >
                  {step.title}
                  <span className="sr-only">
                    {" "}
                    — {step.done ? t("stateDone") : t("stateOpen")}
                  </span>
                </p>

                {step.description && (
                  <p className="text-muted-foreground text-sm">
                    {step.description}
                  </p>
                )}

                {!step.done && step.href && (
                  <Button
                    asChild
                    size="sm"
                    variant={step.id === next?.id ? "default" : "outline"}
                    className="mt-1"
                  >
                    <Link href={step.href}>{step.cta ?? t("open")}</Link>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
