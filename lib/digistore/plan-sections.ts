// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// How the sales page groups the product registry — and the ONE place that
// decides which kinds reach it at all.
//
// ── Why this is a function and not four lines in the page ──────────────────
// It used to be those four lines, and they were wrong. `app/plans/page.tsx`
// fetched `productsByKind("subscription")` and `productsByKind("token")` and
// built its list from the two, so a `kind: "one_time"` product — which the
// registry has held since 0.6.0 and which `lib/billing-mode.ts` already counts
// as a plan — was never loaded. It reached no card, no checkout link and no
// blocker, and the "nothing on offer" empty state fired instead. A vendor
// whose only product was a 149 € course opened their own sales page and read
// that they had nothing to sell.
//
// Enumerating kinds by hand at the call site is what made that possible, so
// the enumeration lives here, once — held complete by two guards. At compile
// time, `_layoutCoversEveryKind` below fails to type-check when a kind added
// to `PRODUCT_KINDS` has no `LAYOUT` row, and the error names the missing
// kind. At runtime, `plan-sections.test.ts` walks `PRODUCT_KINDS` and proves
// every kind lands in a section. Between them, a fourth kind cannot compile
// its way past this file and cannot test green while missing from the page.
//
// PURE, and it takes the product list as an argument rather than reading the
// registry — the same reason `productByDs24Id` in `products.ts` does: the
// shipped `config/digistore-products.json` holds no one-off product, so a
// function that read it directly could not be tested against the very case it
// exists for. (What the registry may CONTAIN is not this file's question:
// `products.ts` refuses to load an unknown kind, so by the time a list
// reaches here, every `kind` is one of `PRODUCT_KINDS`.)
import type { ProductDef, ProductKind } from "./products";

/** A group on the plans page. Also the `plans.<id>Title` / `<id>Body` key. */
export type PlanSectionId = "subscriptions" | "oneTime" | "tokens";

/**
 * The heading and the sentence under it, per section — as keys into the
 * `plans` namespace of `messages/{de,en}.json`.
 *
 * Written out rather than composed as `${id}Title`, and living HERE rather
 * than in the page, for one reason: next-intl renders a missing key as the
 * key itself — no throw, nothing in the log — so the only guard worth having
 * is a test that holds these strings against both language files, and a test
 * cannot reach a constant inside a server component. `plan-sections.test.ts`
 * is that test.
 */
export const SECTION_TEXT: Record<PlanSectionId, { title: string; body: string }> = {
  subscriptions: { title: "subscriptionsTitle", body: "subscriptionsBody" },
  oneTime: { title: "oneTimeTitle", body: "oneTimeBody" },
  tokens: { title: "tokensTitle", body: "tokensBody" },
};

export interface PlanSection {
  id: PlanSectionId;
  /** The products in it, in registry order. Never empty. */
  defs: ProductDef[];
  /** Cards per row from the `sm:` breakpoint up. */
  columns: 2 | 3;
}

/**
 * The order sections appear in, and the layout each one gets.
 *
 * Plans first, the balance last: a subscription and a one-off purchase are
 * both entitlements — `hasPlan()` answers for them and `grantableProducts()`
 * hands them out — while a token package is a quantity. That is the same
 * dividing line `modeSellsPlans()` draws, and this file follows it rather than
 * stating a second opinion about it.
 *
 * Two columns for plans, three for token packages: plans carry a feature list
 * and want the width, packages are a price and a number.
 */
const LAYOUT = [
  { id: "subscriptions", kind: "subscription", columns: 2 },
  { id: "oneTime", kind: "one_time", columns: 2 },
  { id: "tokens", kind: "token", columns: 3 },
] as const satisfies ReadonlyArray<{
  id: PlanSectionId;
  kind: ProductKind;
  columns: 2 | 3;
}>;

// The compile-time half of the guard the header describes. `as const` keeps
// each row's `kind` a literal type, so the union of covered kinds is exact —
// and when `PRODUCT_KINDS` grows a value with no row here, the annotation
// below becomes `{ missingFromLayout: "<that kind>" }`, to which `true` is
// not assignable. The error message carries the name of what is missing.
const _layoutCoversEveryKind: [
  Exclude<ProductKind, (typeof LAYOUT)[number]["kind"]>,
] extends [never]
  ? true
  : { missingFromLayout: Exclude<ProductKind, (typeof LAYOUT)[number]["kind"]> } = true;
void _layoutCoversEveryKind;

/**
 * Group the registry into the sections the plans page renders.
 *
 * A kind with no products yields **no section at all**, so the caller never
 * has to render a heading over nothing — and an empty result is exactly the
 * condition for the page's empty state.
 */
export function planSections(products: ProductDef[]): PlanSection[] {
  const sections: PlanSection[] = [];
  for (const { id, kind, columns } of LAYOUT) {
    const defs = products.filter((p) => p.kind === kind);
    if (defs.length > 0) sections.push({ id, defs, columns });
  }
  return sections;
}
