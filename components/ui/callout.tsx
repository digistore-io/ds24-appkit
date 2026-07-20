import * as React from "react";
import { Info, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// Die EINE Form für Hinweise, Erfolgs-, Warn- und Fehlermeldungen.
//
// Warum zentral: Meldungen sind die Stellen, an denen selbstgebaute Farben am
// haeufigsten schiefgehen — z. B. `text-amber-900` auf `bg-amber-50`, das im
// Dunkelmodus grau auf sandfarben wird und unlesbar ist. Die Varianten hier
// haengen an Token-Paaren aus app/globals.css, die in BEIDEN Themes geprueft
// sind. Deshalb: keine eigenen Farb-Klassen fuer Meldungen schreiben, sondern
// diese Komponente nutzen.
//
//   <Callout variant="warning" title="Kein Mailversand">Text …</Callout>
//
// Varianten:
//   info    — neutraler Hinweis, Standard
//   success — hat geklappt
//   warning — Achtung, aber nichts kaputt
//   danger  — Fehler / etwas ist fehlgeschlagen

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
  // `title` ist am div ein string-Attribut (Tooltip) — hier ist es die
  // Überschrift und darf beliebiges JSX sein, deshalb ausgeschlossen.
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  variant?: CalloutVariant;
  /** Fettgesetzte erste Zeile. Weglassen für eine einzeilige Meldung. */
  title?: React.ReactNode;
  /** Icon ausblenden (z. B. in sehr schmalen Spalten). */
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
      // role="status" statt "alert": Callouts stehen im Seitenfluss und sollen
      // Screenreader nicht unterbrechen. Für wirklich Unterbrechendes (z. B.
      // ein fehlgeschlagener Kauf) role="alert" von aussen setzen.
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
