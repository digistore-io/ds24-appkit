import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// "Nothing here yet" — for empty tables, lists and search results.
//
// An empty area reads like a failure; a box that says what is missing and what
// you can do reads like a beginning. So every list that can be empty gets an
// EmptyState — with an action, if there is one.
//
//   <EmptyState
//     icon={Users}
//     title="No users yet"
//     description="Create the first one — they'll get a sign-in link by email."
//   >
//     <Button>Create user</Button>
//   </EmptyState>
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Action below (optional). */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="bg-muted text-muted-foreground grid size-11 place-items-center rounded-full">
          <Icon aria-hidden className="size-5" />
        </div>
      )}
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && (
          <p className="text-muted-foreground mx-auto max-w-sm text-sm">
            {description}
          </p>
        )}
      </div>
      {children && <div className="mt-1">{children}</div>}
    </div>
  );
}
