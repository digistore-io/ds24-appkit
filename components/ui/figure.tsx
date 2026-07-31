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
   * For an image that is already exactly the size it is shown at. Costs the
   * resizing.
   *
   * **`true` only, deliberately.** Anything not on this app's own origin is
   * already `unoptimized` by default (see below) because `next.config.ts`
   * declares no `remotePatterns` — so passing `false` for a bucket URL would
   * hand `/_next/image` a host it will refuse with a 400, in production only.
   * There is no host it can be told about, so there is nothing a `false` here
   * could correctly mean.
   */
  unoptimized?: true;
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
  const { src, width, height, className, caption, priority, sizes } = props;
  // `?? ""` because `alt` is typed `string` and arrives `null` anyway: a
  // `media` row's `alt` column is nullable, and `createMedia()` — the path
  // `docs/visuals.md` documents for selling a file — accepts a row without one.
  const alt = props.decorative ? "" : (props.alt ?? "").trim();

  // `alt=""` without `decorative` is the half-state this component exists to
  // prevent: the screen reader is told to skip it, but `aria-hidden` is not set
  // and the image is not declared decoration. The type cannot catch it — an
  // empty string satisfies `alt: string` — so the check is here.
  //
  // ── Why it does NOT throw in production ──────────────────────────────────
  // It used to, unguarded, while the comment beside it claimed "in development".
  // A `throw` inside a component is not a lint: React unwinds to the nearest
  // error boundary, so one image whose row happens to carry no alternative text
  // takes down the whole page — an Internal Server Error where the fault is a
  // missing sentence. That trades an accessibility defect for an availability
  // defect, and the second is worse for the same person: a screen-reader user
  // gets no page at all rather than one image they cannot perceive.
  //
  // So it is loud where somebody is building (`throw`, immediately, with the
  // fix in the message) and reported where somebody is using it: the page
  // renders, `node run.mjs errors` picks the line up out of the log, and
  // `ux-gateway` check 8 reports it against the running app.
  if (!props.decorative && alt === "") {
    const message =
      "Figure: `alt` is empty. Say what the picture shows, or mark it `decorative` " +
      `if it shows nothing a reader would miss. (src: ${src})`;
    if (process.env.NODE_ENV !== "production") throw new Error(message);
    console.error(`[figure] ${message}`);
  }

  // ── Why the optimiser is off for bucket media ────────────────────────────
  // `next.config.ts` declares no `remotePatterns`, for the two reasons written
  // out there. So anything not served from this app's own origin has to bypass
  // the optimiser, or Next answers 400. Derived from the URL rather than asked
  // for as a prop, because a caller who forgets it gets a broken image and no
  // explanation.
  const isRemote = /^https?:\/\//.test(src);
  const unoptimized = props.unoptimized ?? isRemote;

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
