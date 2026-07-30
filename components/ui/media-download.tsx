// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The file a customer paid for, presented as something to click.
//
// ── Why this is a component and not a link ─────────────────────────────────
// Because "here is your download" is the moment a purchase becomes real, and a
// bare `<a>` reading `a3f9-4c21-….pdf` is the version of that moment that makes
// somebody wonder whether they bought the right thing. What a person needs
// before they click is the same three facts every time: what it is called, what
// it is, and how big it is — the last one because a 40 MB file on a phone is a
// decision, not a click.
//
// ── No alternative text, and none is missing ───────────────────────────────
// A PDF has nothing to describe. The accessible name is the filename, which is
// what the person is looking for, and the size sits beside it as ordinary text
// rather than in a `title` attribute nobody reads.
import { Download } from "lucide-react";

import { cn } from "@/lib/utils";

export interface MediaDownloadProps {
  /** From `mediaUrlFor(row, { download: true })` — carries the original name. */
  href: string;
  /** The name it was uploaded under. */
  filename: string;
  /** Already formatted — `formatBytes()` from `lib/media/rules.ts`. */
  size: string;
  /** "PDF", "ZIP" — short, and shown as a badge. */
  type?: string;
  className?: string;
}

export function MediaDownload({
  href,
  filename,
  size,
  type,
  className,
}: MediaDownloadProps) {
  return (
    <a
      href={href}
      // `download` is a hint; the real instruction is the
      // `content-disposition` the signed URL carries, because the file is
      // served by the bucket and this attribute does not survive a cross-origin
      // fetch. Both are here: one for the browser that honours it, one for the
      // one that does not.
      download={filename}
      className={cn(
        "flex items-center gap-3 rounded-md border bg-card p-3 text-card-foreground",
        "transition-colors hover:bg-accent hover:text-accent-foreground",
        // The focus ring is not decoration — this is a link somebody may reach
        // with a keyboard, and the design system's token is what keeps it
        // visible in both themes.
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Download className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {/* `truncate` rather than wrapping: a long filename should not push the
            size off the row on a narrow screen. */}
        <span className="block truncate font-medium">{filename}</span>
        <span className="block text-sm text-muted-foreground">
          {type ? `${type} · ${size}` : size}
        </span>
      </span>
    </a>
  );
}
