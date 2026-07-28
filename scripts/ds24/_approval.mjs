// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The READ side of the product approval — "are my products approved yet?"
//
// `request-approval.mjs` writes `approval_status = pending`; nothing used to
// read the answer back, so a forgotten approval surfaced as real purchases
// failing while the test ones worked. This module asks once a day and feeds
// the one unobtrusive surface this project has: a bracketed line in the
// session greeting (scripts/dev/session-start.mjs), plus an `info` check in
// doctor that reads the same cache.
//
// The shape of the answer is PROBED, not documented (2026-07-28, against a
// real account): the OpenAPI spec lists no approval field on `listProducts`
// items, but every item carries `approval_status_list` — one entry per
// reseller:
//
//   { "reseller_id": "1", "approval_status": "new", "approval_status_msg": …,
//     "approval_reject_reason_description": "", … }
//
// Values: "new" (never requested), "pending" (what request-approval sets),
// "approved" / "rejected" (decided by the reseller). Because none of that is
// documented, everything here tolerates a missing list, a missing entry and
// an unknown value — each answers `null`, and `null` means "say nothing".
//
// The properties are the ones update-check.mjs already argues for, and its
// `isDue()` is imported rather than copied:
//
//   **Never fatal.** This sits in front of every session; every failure path
//   resolves to "say nothing".
//   **One listProducts call per day, at most.** Cached in .dev/; once every
//   product is approved the interval stretches to a week (revocation is rare).
//   **Only when there is something to ask about** — a key in the .env and at
//   least one synced productId; anything less is silence, not an error.
//   **Switchable off** — `DIGISTORE_APPROVAL_CHECK=off` in the `.env`.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isDue } from "../dev/update-check.mjs";
import { ds24Call } from "./_client.mjs";
import { extractProducts, idOf, readProducts } from "./_products.mjs";
import { resolveReseller } from "./_resellers.mjs";

const CACHE = ".dev/approval-check.json";
const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

const KNOWN = new Set(["new", "pending", "approved", "rejected"]);

/**
 * The approval status of one listProducts/getProduct item for one siteowner:
 * "new" | "pending" | "approved" | "rejected" — or `null` when the answer
 * cannot be read (missing list, a siteowner the list does not carry, a value
 * this code does not know). `null` is silence, never a guess.
 */
export function approvalStatusOf(product, siteownerId) {
  const list = product?.approval_status_list;
  if (!Array.isArray(list)) return null;
  const entry = list.find((e) => String(e?.reseller_id) === String(siteownerId));
  const status = String(entry?.approval_status ?? "")
    .trim()
    .toLowerCase();
  return KNOWN.has(status) ? status : null;
}

/** Product keys grouped by state. Unreadable statuses (null) appear nowhere. */
export function classifyStatuses(statuses) {
  const grouped = { approved: [], pending: [], rejected: [], unrequested: [] };
  for (const [key, entry] of Object.entries(statuses ?? {})) {
    if (entry?.status === "approved") grouped.approved.push(key);
    else if (entry?.status === "pending") grouped.pending.push(key);
    else if (entry?.status === "rejected") grouped.rejected.push(key);
    else if (entry?.status === "new") grouped.unrequested.push(key);
  }
  return grouped;
}

/** Every synced product approved — the state that earns the longer interval. */
export function allApproved(result) {
  const entries = Object.values(result?.statuses ?? {});
  return entries.length > 0 && entries.every((e) => e?.status === "approved");
}

/**
 * How long yesterday's answer holds. A week once everything is approved for
 * the same siteowner and the same set of products — anything else (a new
 * product, a changed marketplace, a non-approved state, a quiet failure)
 * falls back to the day.
 */
export function ttlFor(cache, siteowner, productIds) {
  if (!allApproved(cache)) return DAY;
  if (String(cache.siteowner) !== String(siteowner)) return DAY;
  const cached = Object.values(cache.statuses)
    .map((e) => String(e.productId))
    .sort();
  const wanted = productIds.map(String).sort();
  if (cached.length !== wanted.length) return DAY;
  if (cached.some((id, i) => id !== wanted[i])) return DAY;
  return WEEK;
}

/**
 * The greeting's line, or null when there is nothing worth saying. One line
 * total, never one per product; the worst state wins, because it is the one
 * that costs sales: rejected > never requested > pending. All approved — or
 * nothing readable — is silence.
 *
 * Takes `null` as readily as an object, for the same reason describe() in
 * update-check.mjs does: that is what approvalReport() answers whenever it
 * cannot answer.
 */
export function describeApproval(result) {
  const grouped = classifyStatuses(result?.statuses);
  const quote = (keys) => keys.map((k) => `"${k}"`).join(", ");
  if (grouped.rejected.length > 0) {
    return (
      `[DS24: approval REJECTED for ${quote(grouped.rejected)} — read the reason in ` +
      `your Digistore24 account, then node run.mjs ds24-approval --apply]`
    );
  }
  if (grouped.unrequested.length > 0) {
    return (
      `[DS24: ${grouped.unrequested.length} product(s) not submitted for approval yet — ` +
      `only test purchases work until approved. Go-live step: node run.mjs ds24-approval --apply]`
    );
  }
  if (grouped.pending.length > 0) {
    return (
      `[DS24: approval pending for ${grouped.pending.length} product(s) — ` +
      `real sales start once Digistore24 approves.]`
    );
  }
  return null;
}

/** Park the answer in .dev/ for the day. A failure here is not worth a word. */
function remember(result) {
  try {
    mkdirSync(".dev", { recursive: true });
    writeFileSync(CACHE, `${JSON.stringify(result)}\n`);
  } catch {
    /* then it asks again next session */
  }
}

/**
 * A request was just applied — yesterday's cached answer is now wrong, and the
 * greeting must not lag a day behind it. Called by request-approval.mjs.
 */
export function dropApprovalCache() {
  try {
    rmSync(CACHE, { force: true });
  } catch {
    /* a cache that cannot be deleted expires on its own */
  }
}

/**
 * The cached answer — `{ checkedAt, siteowner, statuses: { key: { productId,
 * status } } }` — refreshed with one listProducts call when it is due, and
 * `null` whenever the question cannot be answered: no key, nothing synced,
 * switched off, offline, malformed anything.
 */
export async function approvalReport(now = Date.now()) {
  try {
    if (String(process.env.DIGISTORE_APPROVAL_CHECK ?? "").toLowerCase() === "off") return null;
    const apiKey = process.env.DIGISTORE_API_KEY;
    if (!apiKey) return null;

    // Products that exist at Digistore24 are the only ones that can have a
    // status there. An unsynced registry is a setup state, not a finding.
    let entries;
    try {
      entries = Object.entries(readProducts().products).filter(([, def]) => def.productId);
    } catch {
      return null;
    }
    if (entries.length === 0) return null;

    // The same resolution the write side uses (request-approval.mjs), so the
    // check and the request talk about the same marketplace by construction.
    let siteowner;
    try {
      siteowner = resolveReseller({
        siteowner: process.env.DIGISTORE_SITEOWNER_ID,
        lang: process.env.APP_LANG || "de",
      }).id;
    } catch {
      return null;
    }

    let cache = null;
    try {
      cache = JSON.parse(readFileSync(CACHE, "utf8"));
    } catch {
      /* first run, or somebody deleted .dev/ */
    }
    const productIds = entries.map(([, def]) => String(def.productId));
    if (!isDue(cache, now, ttlFor(cache, siteowner, productIds))) return cache;

    // A "cannot answer" is remembered for the same day as an answer — an
    // offline machine pays one failed request, not one per session.
    const quiet = () => {
      remember({ checkedAt: now, siteowner, statuses: null });
      return null;
    };

    let list;
    try {
      list = extractProducts(
        await ds24Call("listProducts", apiKey, {}, { signal: AbortSignal.timeout(3000) }),
      );
    } catch {
      return quiet();
    }

    const byId = new Map(list.map((p) => [String(idOf(p)), p]));
    const statuses = {};
    for (const [key, def] of entries) {
      const product = byId.get(String(def.productId)) ?? null;
      statuses[key] = {
        productId: String(def.productId),
        status: approvalStatusOf(product, siteowner),
      };
    }

    const result = { checkedAt: now, siteowner, statuses };
    remember(result);
    return result;
  } catch {
    return null;
  }
}
