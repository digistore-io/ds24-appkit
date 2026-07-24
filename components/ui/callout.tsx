import * as React from "react";
import { Info, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// The ONE shape for notices, success, warning and error messages.
//
// Why centralized: messages are where hand-picked colors go wrong most often —
// e.g. `text-amber-900` on `bg-amber-50`, which turns grey on sand in dark
// mode and becomes unreadable. The variants here hang off token pairs from
// app/globals.css that are checked in BOTH themes. So: do not write your own
// color classes for messages, use this component.
//
//   <Callout variant="warning" title="No mail transport">Text …</Callout>
//
// Variants:
//   info    — neutral notice, the default
//   success — it worked
//   warning — pay attention, but nothing is broken
//   danger  — error / something failed

const VARIANTS = {
  info: {
    box: "border-info-border bg-info text-info-foreground",
    Icon: Info,
  },
  success: {
    box: "border-success-border bg-success text-success-foreground",
    Icon: CheckCircle2,
  },
  warning: {
    box: "border-warning-border bg-warning text-warning-foreground",
    Icon: AlertTriangle,
  },
  danger: {
    box: "border-danger-border bg-danger text-danger-foreground",
    Icon: XCircle,
  },
} as const;

export type CalloutVariant = keyof typeof VARIANTS;

export interface CalloutProps
  // On a div, `title` is a string attribute (tooltip) — here it is the
  // heading and may be arbitrary JSX, hence it is excluded.
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  variant?: CalloutVariant;
  /** Bold first line. Omit for a single-line message. */
  title?: React.ReactNode;
  /** Hide the icon (e.g. in very narrow columns). */
  hideIcon?: boolean;
}

export function Callout({
  variant = "info",
  title,
  hideIcon = false,
  className,
  children,
  ...props
}: CalloutProps) {
  const { box, Icon } = VARIANTS[variant];
  return (
    <div
      // role="status" rather than "alert": callouts sit in the page flow and
      // should not interrupt screen readers. For something genuinely
      // interrupting (e.g. a failed purchase) set role="alert" from outside.
      role="status"
      className={cn(
        "flex gap-3 rounded-xl border px-4 py-3 text-sm [&_a]:underline [&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1 [&_code]:py-0.5 dark:[&_code]:bg-white/10",
        box,
        className,
      )}
      {...props}
    >
      {!hideIcon && <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-1")}>{children}</div>}
      </div>
    </div>
  );
}
