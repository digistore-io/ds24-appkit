// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import * as React from "react";
import { cn } from "@/lib/utils";

// The head of every page: title, one sentence of explanation, the primary
// action on the right.
//
// Always use this instead of your own <h1> — then all pages share the same
// spacing and sizes, including the ones someone adds later.
//
//   <PageHeader title="Users" description="Who may do what.">
//     <Button>Create user</Button>
//   </PageHeader>
export function PageHeader({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Actions on the right (buttons, menus). */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="truncate text-2xl font-semibold">{title}</h1>
        {description && (
          <p className="text-muted-foreground text-sm">{description}</p>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {children}
        </div>
      )}
    </div>
  );
}
