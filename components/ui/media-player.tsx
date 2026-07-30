// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// A video or a recording, played from wherever it is stored.
//
// ── No player library, and none is missing ─────────────────────────────────
// `<video controls>` and `<audio controls>` are a player: play, pause, seek,
// volume, speed, fullscreen, keyboard, and a screen-reader-friendly set of
// controls the browser maintains. A JavaScript player replaces all of that with
// a version somebody has to keep working, and the reason people reach for one —
// a consistent look across browsers — is not worth a dependency in a template
// whose whole point is that a vendor can read what it does.
//
// ── The `src` comes from `lib/media/url.ts`, and it points at the bucket ────
// That is not an implementation detail here, it is the feature: seeking through
// a recording issues **range requests**, and a bucket answers those by itself.
// A player pointed at this app would make every viewer's scrubbing into work
// for the node serving the page, and the app would have to implement
// `206 Partial Content` to make it work at all.
//
// ── `preload="metadata"` ───────────────────────────────────────────────────
// So the control bar knows how long the thing is without fetching it. `auto`
// downloads a recording nobody pressed play on — on a page with three of them,
// that is three files pulled on load, billed as egress, on a phone.
import { cn } from "@/lib/utils";

export interface MediaPlayerProps {
  src: string;
  kind: "video" | "audio";
  /** Recorded media type, so the browser need not guess from the URL. */
  mime: string;
  /** A still shown before play. Only meaningful for video. */
  poster?: string;
  className?: string;
  /**
   * What this is, for somebody who cannot see or hear it.
   *
   * Not an `alt` — a media element has no such attribute. It becomes the
   * accessible name, which is what a screen reader announces instead of "video".
   * Required for the same reason `Figure` requires one: a page full of unnamed
   * players is a page nobody can navigate.
   */
  label: string;
}

export function MediaPlayer({
  src,
  kind,
  mime,
  poster,
  className,
  label,
}: MediaPlayerProps) {
  if (kind === "audio") {
    return (
      <audio
        controls
        preload="metadata"
        aria-label={label}
        className={cn("w-full", className)}
      >
        <source src={src} type={mime} />
      </audio>
    );
  }

  return (
    <video
      controls
      preload="metadata"
      poster={poster}
      aria-label={label}
      // `bg-muted` behind it: a video's own letterboxing is black, and black
      // bars on a light page read as a broken element rather than as a video.
      className={cn("w-full rounded-md bg-muted", className)}
    >
      <source src={src} type={mime} />
    </video>
  );
}
