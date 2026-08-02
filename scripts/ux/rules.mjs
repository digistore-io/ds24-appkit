// The measurable half of docs/ux.md, as pure functions.
//
// Separate from check.mjs for the reason every rules file in this project is
// separate from its shell (lib/entitlements/rules.ts says it at length): a rule
// that lives inside the script that prints it is a rule nothing asserts. These
// take a string and return findings — no filesystem, no console, no exit code —
// so scripts/ux/rules.test.ts can put a bad line in and check that it is found,
// which is the only way anybody ever learns that a check still works.
//
// Plain Node, no dependency — Linux, macOS and Git Bash on Windows.

// ── The rules, as data ───────────────────────────────────────────────────────

/**
 * Text on a surface, measured against WCAG 2.1 AA (4.5:1 for normal text).
 *
 * `[foreground token, background token]`. Two things in here are not obvious
 * and are why the list is written out rather than derived from the
 * `-foreground` suffix:
 *
 *   - `muted-foreground` is never used on `muted`. It is the quiet text on a
 *     page or in a card, so it is measured against those two. Pairing it with
 *     `muted` would measure a combination nothing renders.
 *   - `primary` appears as TEXT as well as a surface — the active menu item, a
 *     link. app/globals.css says so in its own header, and it is the half of a
 *     recolour that people forget: a brand colour light enough to look good as
 *     a button can be unreadable as a word.
 */
export const TEXT_PAIRS = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["destructive-foreground", "destructive"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["primary", "background"],
  ["primary", "card"],
  ["info-foreground", "info"],
  ["success-foreground", "success"],
  ["warning-foreground", "warning"],
  ["danger-foreground", "danger"],
];

/**
 * The focus ring, measured at 3:1 (WCAG 1.4.11, non-text contrast).
 *
 * Only the ring. An input border at 3:1 is also the letter of 1.4.11 and this
 * template does not meet it — that is a judgement written down in docs/ux.md
 * rather than a number failed here, because a check that is red on a fresh
 * clone is a check everybody learns to ignore. The ring is different: it is the
 * only thing a keyboard user has to find their place with, and `--ring` is one
 * of the three tokens the recolouring instructions tell people to change.
 */
export const RING_PAIRS = [
  ["ring", "background"],
  ["ring", "card"],
];

/** Tailwind's own palettes. A colour from here does not follow into dark mode. */
const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|" +
  "teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const COLOR_UTILITIES =
  "bg|text|border|ring|fill|stroke|from|via|to|decoration|outline|shadow|" +
  "accent|caret|divide|placeholder";

/**
 * Elements the design system already has a component for. Writing one by hand
 * is not a style question: the hand-built version has no focus ring, no dark
 * mode and different spacing two pages later.
 *
 * `input` is handled separately in `findRawElements` — its `type` decides.
 */
const RAW_ELEMENTS = ["button", "select", "textarea", "table"];

// ── Colour maths (WCAG 2.1, relative luminance) ──────────────────────────────

/**
 * `hsl(243 70% 58%)` → `[r, g, b]`, 0–255.
 *
 * Only the space-separated form app/globals.css uses. A comma form or a `#hex`
 * returns null, and the caller reports that as "cannot read" rather than
 * skipping it silently — a token nothing can parse is a token nothing checks.
 */
export function parseHsl(value) {
  const m = /^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;

  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(channel(h + 1 / 3) * 255),
    Math.round(channel(h) * 255),
    Math.round(channel(h - 1 / 3) * 255),
  ];
}

/** WCAG 2.1 relative luminance. */
export function relativeLuminance([r, g, b]) {
  const channel = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio, 1–21. Order of the arguments does not matter. */
export function contrastRatio(rgbA, rgbB) {
  const a = relativeLuminance(rgbA);
  const b = relativeLuminance(rgbB);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The two token blocks of app/globals.css.
 *
 * Deliberately not a CSS parser: it reads the `:root { … }` and `.dark { … }`
 * blocks and the `--name: value;` lines inside them, which is all this file has
 * ever contained. A block it cannot find comes back empty, and the caller
 * reports that rather than passing.
 *
 * @param {string} css
 * @returns {{ light: Record<string, string>, dark: Record<string, string> }}
 */
export function parseTokens(css) {
  /** @type {(selector: string) => Record<string, string>} */
  const block = (selector) => {
    const start = css.indexOf(`${selector} {`);
    if (start === -1) return {};
    const end = css.indexOf("\n}", start);
    if (end === -1) return {};
    const body = css.slice(start, end);
    const out = {};
    for (const m of body.matchAll(/^\s*--([a-z0-9-]+):\s*([^;]+);/gim)) {
      out[m[1]] = m[2].trim();
    }
    return out;
  };
  return { light: block(":root"), dark: block(".dark") };
}

// ── The source scans ─────────────────────────────────────────────────────────

const lineAt = (source, index) => source.slice(0, index).split(/\r?\n/).length;

/** Every hard-coded colour — the ones that do not follow into dark mode. */
export function findPaletteClasses(source) {
  const patterns = [
    new RegExp(
      `\\b(?:${COLOR_UTILITIES})-(?:${PALETTE})-(?:50|[1-9]00|950)\\b`,
      "g",
    ),
    /\b(?:bg|text|border|ring|fill|stroke|divide|placeholder)-(?:white|black)\b/g,
  ];
  const hits = [];
  source.split(/\r?\n/).forEach((line, i) => {
    for (const pattern of patterns) {
      for (const m of line.matchAll(pattern)) {
        hits.push({ line: i + 1, found: m[0] });
      }
    }
  });
  return hits;
}

/**
 * Elements built by hand where the kit has a component.
 *
 * Two buckets, because "the kit already has this" and "the kit does not have
 * this yet" are different sentences to say to somebody:
 *
 *   `hard` — `<button>`, `<select>`, `<textarea>`, `<table>` and a text
 *            `<input>`. All of them are in components/ui/. No excuse.
 *   `soft` — a checkbox, a radio, a segmented control. The kit ships
 *            <Checkbox>, <RadioGroup> and <Switch> for client forms — but a
 *            Radix control cannot reach FormData without JavaScript, so a
 *            native input in a plain-POST form is sometimes the correct
 *            element (app/plans/page.tsx says why above its checkbox), and a
 *            segmented control has no kit counterpart at all (no ToggleGroup).
 *            Reported so they stay visible, never failed.
 */
export function findRawElements(source) {
  const hits = [];

  // Radix composition: `<DropdownMenuItem asChild><button …>` MERGES the two —
  // the menu item BECOMES the button and brings its styling, focus and keyboard
  // handling with it. Putting a <Button> in there instead would nest two of
  // everything. So a raw element directly under an `asChild` slot is the
  // idiomatic form, not a shortcut.
  const composed = (index) =>
    /asChild[^<>]*>\s*$/.test(source.slice(Math.max(0, index - 200), index));

  // `[^>]` matches newlines, so a tag spread over several lines is one match.
  const pattern = new RegExp(`<(${RAW_ELEMENTS.join("|")})\\b[^>]*>`, "g");
  for (const m of source.matchAll(pattern)) {
    if (composed(m.index)) continue;
    // An element carrying an explicit `role` is deliberately NOT the thing its
    // tag name says — `<button role="radio">` is one cell of a segmented
    // control, and the kit ships no ToggleGroup to build that from.
    const role = /\brole=["']([a-z]+)["']/.exec(m[0])?.[1];
    const soft = role !== undefined && role !== "button";
    hits.push({
      line: lineAt(source, m.index),
      found: soft ? `<${m[1]} role="${role}">` : `<${m[1]}>`,
      kind: soft ? "soft" : "hard",
    });
  }

  for (const m of source.matchAll(/<input\b[^>]*>/g)) {
    const type = /type=["']([a-z]+)["']/.exec(m[0])?.[1] ?? "text";
    // Not an interface element at all: it carries form data and nobody ever
    // sees it. Skipped rather than excused.
    if (type === "hidden") continue;
    const soft = type === "checkbox" || type === "radio";
    hits.push({
      line: lineAt(source, m.index),
      found: `<input type="${type}">`,
      kind: soft ? "soft" : "hard",
    });
  }

  return hits.sort((a, b) => a.line - b.line);
}

/**
 * Icon-only buttons nobody can name.
 *
 * A `size="icon"` button whose only content is a picture has no name at all for
 * a screen reader — it reads as "button", and there is no way to find out what
 * it does. It needs an `aria-label`, or a `<span className="sr-only">` beside
 * the icon.
 *
 * The window is 500 characters from the tag, which comfortably covers a button
 * and its children, and is why this does not try to match nested JSX.
 */
export function findUnnamedIconButtons(source) {
  const hits = [];
  const lines = source.split(/\r?\n/);
  for (const m of source.matchAll(/<Button\b/g)) {
    const window = source.slice(m.index, m.index + 500);
    const tagEnd = window.indexOf(">");
    const tag = tagEnd === -1 ? window : window.slice(0, tagEnd);
    if (!/size=["']icon["']/.test(tag)) continue;
    if (/aria-label|aria-labelledby|sr-only/.test(window)) continue;
    const line = lineAt(source, m.index);
    hits.push({ line, found: lines[line - 1]?.trim().slice(0, 60) ?? "" });
  }
  return hits;
}

/** `<img>` / `<Image>` with no `alt`. An empty `alt=""` is a decision and passes. */
export function findImagesWithoutAlt(source) {
  const hits = [];
  for (const m of source.matchAll(/<(img|Image)\b[^>]*>/g)) {
    if (/\salt=/.test(m[0])) continue;
    hits.push({ line: lineAt(source, m.index), found: `<${m[1]}>` });
  }
  return hits;
}

/** The `href`s declared in NAVIGATION, or null if the list cannot be found. */
export function navHrefs(appShellSource) {
  const start = appShellSource.indexOf("export const NAVIGATION");
  if (start === -1) return null;
  const body = appShellSource.slice(start);
  return [...body.matchAll(/href:\s*["']([^"']+)["']/g)].map((m) => m[1]);
}
