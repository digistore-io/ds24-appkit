// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// An image on a page, which cannot be written without saying what it shows.
//
// ── Why this is a type and not a lint rule ─────────────────────────────────
// "Images with no `alt`" is the single most common finding the `ux-gateway`
// skill reports, and a finding is something somebody has to run a check to
// discover and then go back and fix. Here it is a compile error: there is no
// way to render this component without either writing the alternative text or
// saying, in as many characters, that the image is decoration. The finding
// becomes impossible rather than merely detected.
//
// **`decorative` is not a way out.** It is the correct answer for an image that
// carries no information a sighted reader gets — a divider, a texture, a
// pattern behind a heading — and for those an empty `alt` is what a screen
// reader needs, because announcing "decorative-swoosh.png" is worse than
// silence. It is the wrong answer for anything a reader would miss, and the two
// cases are told apart by whoever is writing the page, which is the only place
// they can be told apart.
//
// ── Why `next/image` and not `<img>` ───────────────────────────────────────
// Sizing. An app that hands a phone the 4 MB photo somebody took on a phone is
// the finding `performance-gateway` reports next, and `next/image` resizes on
// demand with the `sharp` that Next brings itself — no dependency of ours.
import Image from "next/image";

import { cn } from "@/lib/utils";

type FigureBase = {
  src: string;
  width: number;
  height: number;
  className?: string;
  /** A visible caption. Rendered as a `<figcaption>`, and NOT a substitute for `alt`. */
  caption?: string;
  /**
   * Render at natural size without Next's optimiser.
   *
   * For an image that is already exactly the size it is shown at, or one served
   * from a host `next.config.ts` was not told about. Costs the resizing.
   */
  unoptimized?: boolean;
  priority?: boolean;
  sizes?: string;
};

/**
 * Either say what it shows, or say that it shows nothing.
 *
 * The union is what produces the compile error: neither branch is satisfied by
 * an object with no `alt` and no `decorative`.
 */
export type FigureProps = FigureBase &
  (
    | { alt: string; decorative?: false }
    | { decorative: true; alt?: never }
  );

export function Figure(props: FigureProps) {
  const { src, width, height, className, caption, unoptimized, priority, sizes } = props;
  const alt = props.decorative ? "" : props.alt;

  const image = (
    <Image
      src={src}
      // Empty for a decorative image. That is the documented way to tell a
      // screen reader to skip an element — not a missing attribute, which makes
      // it read the filename out instead.
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      priority={priority}
      unoptimized={unoptimized}
      // `bg-muted` rather than nothing: a picture with a light background of its
      // own sitting on a dark page is the dark-mode finding this template's own
      // gateway looks for, and a neutral plate behind it is what stops the
      // transparent parts of a PNG from disappearing into the page.
      className={cn("h-auto max-w-full rounded-md bg-muted object-cover", className)}
      // Decorative images are hidden from assistive technology entirely, which
      // is the other half of an empty `alt` — some readers announce an
      // `alt=""` image as "image" without it.
      aria-hidden={props.decorative ? true : undefined}
    />
  );

  if (!caption) return image;

  return (
    <figure className="space-y-2">
      {image}
      <figcaption className="text-sm text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}
