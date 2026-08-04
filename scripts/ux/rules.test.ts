// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// `node run.mjs ux-check` is only worth having if it is trusted, and trust here
// breaks in two directions — exactly as it does for `node run.mjs errors`.
//
// Miss a real one and the app ships with unreadable text while the command says
// green. Flag something correct and the command cries wolf on a fresh clone
// until nobody reads it any more. This project's own template is the second
// case: `<input type="hidden">`, a `<button>` under a Radix `asChild` slot and
// a segmented control all LOOK like violations to a naive regex and are not.
//
// So both directions are tested, and every "must not flag" case below is a real
// line taken out of this template.

import { describe, expect, it } from "vitest";

import {
  parseHsl,
  contrastRatio,
  parseTokens,
  findPaletteClasses,
  findRawElements,
  findUnnamedIconButtons,
  findImagesWithoutAlt,
  findPlaceholderHome,
  navHrefs,
} from "./rules.mjs";

describe("parseHsl", () => {
  it("reads the form app/globals.css uses", () => {
    expect(parseHsl("hsl(0 0% 100%)")).toEqual([255, 255, 255]);
    expect(parseHsl("hsl(0 0% 0%)")).toEqual([0, 0, 0]);
  });

  it("reads a saturated colour", () => {
    // --primary in the light block.
    const rgb = parseHsl("hsl(243 70% 58%)");
    expect(rgb).not.toBeNull();
    const [r, g, b] = rgb!;
    expect(b).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(g);
  });

  it("returns null for a form it does not understand", () => {
    // The caller REPORTS this rather than skipping it — a token nothing can
    // parse is a token nothing checks, and silence there is the worst outcome.
    expect(parseHsl("#4f46e5")).toBeNull();
    expect(parseHsl("hsl(243, 70%, 58%)")).toBeNull();
    expect(parseHsl("oklch(0.55 0.2 275)")).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for a colour on itself", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([120, 30, 200], [120, 30, 200])).toBeCloseTo(1, 5);
  });

  it("does not care which way round the arguments come", () => {
    const a: [number, number, number] = [30, 30, 30];
    const b: [number, number, number] = [200, 200, 200];
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });

  it("agrees with a known WCAG value", () => {
    // #767676 on white is the canonical 4.54:1 — the shade that just passes AA.
    expect(contrastRatio([118, 118, 118], [255, 255, 255])).toBeCloseTo(4.54, 1);
  });
});

describe("parseTokens", () => {
  const css = `
:root {
  --background: hsl(0 0% 100%);
  --primary: hsl(243 70% 58%);
}

.dark {
  --background: hsl(240 10% 5%);
  --primary: hsl(243 85% 74%);
}

@theme inline {
  --color-primary: var(--primary);
}
`;

  it("reads both blocks separately", () => {
    const tokens = parseTokens(css);
    expect(tokens.light.primary).toBe("hsl(243 70% 58%)");
    expect(tokens.dark.primary).toBe("hsl(243 85% 74%)");
  });

  it("does not drag @theme's var() aliases in", () => {
    // Those are Tailwind plumbing, not colours. A `var(--primary)` reaching
    // parseHsl would be reported as unreadable on every single run.
    const tokens = parseTokens(css);
    expect(tokens.light["color-primary"]).toBeUndefined();
    expect(tokens.dark["color-primary"]).toBeUndefined();
  });

  it("comes back empty rather than throwing when a block is missing", () => {
    expect(parseTokens("body { color: red; }")).toEqual({ light: {}, dark: {} });
  });
});

describe("findPaletteClasses", () => {
  it("finds a hard-coded palette colour", () => {
    const hits = findPaletteClasses('<div className="bg-blue-600 p-4">');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ line: 1, found: "bg-blue-600" });
  });

  it("finds one behind a variant", () => {
    expect(findPaletteClasses('className="dark:text-gray-500"')[0]?.found).toBe(
      "text-gray-500",
    );
  });

  it("finds bg-white and text-black", () => {
    // No shade, so the first pattern misses them — and they break dark mode
    // just as thoroughly.
    expect(findPaletteClasses('className="bg-white"')).toHaveLength(1);
    expect(findPaletteClasses('className="text-black"')).toHaveLength(1);
  });

  it("leaves the tokens alone", () => {
    const source =
      '<div className="bg-card text-muted-foreground border-input bg-primary ' +
      'text-success-foreground bg-destructive">';
    expect(findPaletteClasses(source)).toEqual([]);
  });

  it("reports the line it is on", () => {
    expect(findPaletteClasses("a\nb\n<p className='text-red-700'>")[0]?.line).toBe(3);
  });
});

describe("findRawElements", () => {
  it("flags a hand-built button, select, textarea and table", () => {
    const kinds = findRawElements(
      '<button className="rounded">x</button><select /><textarea /><table />',
    );
    expect(kinds).toHaveLength(4);
    expect(kinds.every((h) => h.kind === "hard")).toBe(true);
  });

  it("flags a text input", () => {
    const hits = findRawElements('<input name="email" />');
    expect(hits).toEqual([
      { line: 1, found: '<input type="text">', kind: "hard" },
    ]);
  });

  it('ignores <input type="hidden">', () => {
    // Not an interface element at all — it carries form data and nobody sees
    // it. Eight of these ship in this template; flagging them would have made
    // the command red on a fresh clone, which is how a check dies.
    expect(
      findRawElements('<input type="hidden" name="memberId" value={id} />'),
    ).toEqual([]);
  });

  it("ignores a hidden input written across several lines", () => {
    expect(
      findRawElements(
        '<input\n  type="hidden"\n  name="granted"\n  value={"true"}\n/>',
      ),
    ).toEqual([]);
  });

  it("ignores a raw element under a Radix asChild slot", () => {
    // asChild MERGES the two: the menu item becomes the button. Wrapping a
    // <Button> in there would nest two of everything. components/app-shell.tsx
    // does exactly this for the sign-out item.
    const source =
      '<DropdownMenuItem asChild variant="destructive">\n' +
      '  <button type="submit" className="w-full">\n' +
      "    {t('signOut')}\n" +
      "  </button>\n" +
      "</DropdownMenuItem>";
    expect(findRawElements(source)).toEqual([]);
  });

  it("softens a checkbox, a radio and a segmented control", () => {
    // Reported so they stay visible, never failed. The kit ships <Checkbox>,
    // <RadioGroup> and <Switch> for client forms, but a Radix control cannot
    // reach FormData without JavaScript — app/plans/page.tsx keeps a native
    // checkbox for exactly that reason — and there is no <ToggleGroup> at all.
    // The bucket text in rules.mjs carries the full reasoning.
    const checkbox = findRawElements('<input type="checkbox" name="autoReload" />');
    expect(checkbox[0]).toMatchObject({ kind: "soft" });

    const segment = findRawElements(
      '<button type="button" role="radio" aria-checked={active}>',
    );
    expect(segment[0]).toMatchObject({
      kind: "soft",
      found: '<button role="radio">',
    });
  });

  it('does not soften role="button" — that is just a button', () => {
    expect(
      findRawElements('<button role="button" className="p-2">')[0],
    ).toMatchObject({ kind: "hard" });
  });
});

describe("findUnnamedIconButtons", () => {
  it("flags an icon button with nothing but a picture in it", () => {
    const source = '<Button size="icon" variant="ghost">\n  <Menu />\n</Button>';
    expect(findUnnamedIconButtons(source)).toHaveLength(1);
  });

  it("accepts an aria-label", () => {
    expect(
      findUnnamedIconButtons(
        '<Button size="icon" aria-label={t("openMenu")}>\n  <Menu />\n</Button>',
      ),
    ).toEqual([]);
  });

  it("accepts an sr-only span beside the icon", () => {
    expect(
      findUnnamedIconButtons(
        '<Button size="icon">\n  <Menu />\n  <span className="sr-only">Menu</span>\n</Button>',
      ),
    ).toEqual([]);
  });

  it("leaves buttons that carry text alone", () => {
    // Only `size="icon"` is at issue. A button with a label names itself.
    expect(findUnnamedIconButtons("<Button>\n  <Save />\n  Save\n</Button>")).toEqual(
      [],
    );
  });
});

describe("findImagesWithoutAlt", () => {
  it("flags an image with no alt", () => {
    expect(findImagesWithoutAlt('<Image src="/logo.png" width={40} />')).toHaveLength(
      1,
    );
  });

  it('accepts alt="" — decoration is a decision', () => {
    expect(findImagesWithoutAlt('<img src="/line.svg" alt="" />')).toEqual([]);
  });

  it("accepts a real alt", () => {
    expect(findImagesWithoutAlt('<Image src="/a.png" alt={t("chart")} />')).toEqual(
      [],
    );
  });
});

describe("findPlaceholderHome", () => {
  it("flags the shipped page by its keys AND its icon trio", () => {
    // Both markers as they stand in the shipped app/page.tsx.
    const source = `
import { KeyRound, ShoppingCart, Sparkles, ArrowRight } from "lucide-react";
const features = [
  { icon: KeyRound, title: "features.authTitle", body: "features.authBody" },
] as const;`;
    expect(findPlaceholderHome(source)).toHaveLength(2);
  });

  it("still flags a re-texted placeholder — the keys survive a text swap", () => {
    // The field case: messages/*.json rewritten, the page untouched. The
    // shipped KEY is still referenced even though the sentences are new.
    const source = `const features = [{ title: "features.authTitle" }];`;
    expect(findPlaceholderHome(source)).toHaveLength(1);
  });

  it("accepts a page that was genuinely replaced", () => {
    const source = `
import { ArrowRight, Check } from "lucide-react";
<h1>{t("hero.title")}</h1>`;
    expect(findPlaceholderHome(source)).toEqual([]);
  });

  it("does not flag one shipped icon on its own", () => {
    // Sparkles is a perfectly normal icon for a real page — only the shipped
    // trio in one import reads as the placeholder.
    const source = `import { Sparkles } from "lucide-react";`;
    expect(findPlaceholderHome(source)).toEqual([]);
  });
});

describe("navHrefs", () => {
  it("reads the hrefs out of NAVIGATION", () => {
    const source = `
const OTHER = [{ href: "/nope" }];
export const NAVIGATION: NavItem[] = [
  { href: "/dashboard", labelKey: "overview", icon: LayoutDashboard },
  { href: "/dashboard/account", labelKey: "account", icon: CircleUser },
];`;
    // "/nope" sits BEFORE the list and must not be counted — otherwise an
    // unrelated array above it would silently excuse a page from the menu.
    expect(navHrefs(source)).toEqual(["/dashboard", "/dashboard/account"]);
  });

  it("returns null when there is no NAVIGATION to read", () => {
    // null means "cannot tell", which the caller reports as a warning. An
    // empty array would mean "no page is in the menu" and fail every page.
    expect(navHrefs("export const FOO = [];")).toBeNull();
  });
});
