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
//     "is_siteowner_active": "Y", "approval_reject_reason_description": "", … }
//
// Values: "new" (never requested), "pending" (what request-approval sets),
// "approved" / "rejected" (decided by the reseller). Because none of that is
// documented, everything here tolerates a missing list, a missing entry and
// an unknown value — each answers `null`, and `null` means "say nothing".
//
// **A product has ONE status here, aggregated across every marketplace**, by
// the vendor's rule: approved anywhere wins, else pending, else rejected, else
// new. That is the question this file exists to answer — "can I sell this?" —
// and it is deliberately siteowner-independent: a product approved in DE sells
// in DE, whatever the US reseller has decided. The per-siteowner view is a
// different question and has its own function (`approvalStatusOf`), used by
// the write side, where the marketplace being written to is the whole point.
//
// The properties are the ones update-check.mjs already argues for, and its
// `isDue()` is imported rather than copied:
//
//   **Never fatal.** This sits in front of every session; every failure path
//   resolves to "say nothing". That is also why `_client.mjs` is imported
//   lazily below — see `approvalReport`.
//   **One listProducts call per day, at most.** Cached in .dev/; once every
//   product is approved the interval stretches to a week.
//   **Only when there is something to ask about** — a key in the .env and at
//   least one synced productId; anything less is silence, not an error.
//   **Switchable off** — `DIGISTORE_APPROVAL_CHECK=off` in the `.env`.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDue } from "../dev/update-check.mjs";
import { extractProducts, idOf, readProducts } from "./_products.mjs";

// Resolved from this file, not from the cwd — `_products.mjs` resolves the
// registry the same way, and the two must agree. A cwd-relative path let
// `node scripts/ds24/request-approval.mjs` run from another folder find the
// products, send the request, and then delete a cache that was never there.
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CACHE_PATH = join(PROJECT_ROOT, ".dev", "approval-check.json");

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

/** Beyond this a cached answer is too old to report as if it were current. */
export const MAX_CACHE_AGE = 30 * DAY;

/** The API's timeout. Short on purpose: this runs in front of every session. */
const REQUEST_TIMEOUT_MS = 3000;

export const KNOWN_STATUSES = ["new", "pending", "approved", "rejected"];
const KNOWN = new Set(KNOWN_STATUSES);

/** Worst-to-best is not the order here — sellability is. See the header. */
const PRECEDENCE = ["approved", "pending", "rejected", "new"];

function readStatus(entry) {
  const status = String(entry?.approval_status ?? "")
    .trim()
    .toLowerCase();
  return KNOWN.has(status) ? status : null;
}

/**
 * A marketplace the account is not active for cannot act on a request, so its
 * entry says nothing about whether the product can be sold. Only an explicit
 * "N" counts as inactive — the field is undocumented, and treating a missing
 * one as inactive would silence the whole feature if it ever disappears.
 */
function isActive(entry) {
  return String(entry?.is_siteowner_active ?? "").trim().toUpperCase() !== "N";
}

/**
 * The status of one listProducts/getProduct item **for one siteowner**:
 * "new" | "pending" | "approved" | "rejected" — or `null` when the answer
 * cannot be read (missing list, a siteowner the list does not carry, a value
 * this code does not know). `null` is silence, never a guess.
 *
 * This is the WRITE side's question: `request-approval.mjs` writes to one
 * marketplace and must not overwrite an approval on that one. The greeting
 * asks the aggregated question instead — `aggregateApprovalStatus`.
 */
export function approvalStatusOf(product, siteownerId) {
  const list = product?.approval_status_list;
  if (!Array.isArray(list)) return null;
  return readStatus(list.find((e) => String(e?.reseller_id) === String(siteownerId)));
}

/**
 * The status of one item across EVERY marketplace it is active for, by the
 * vendor's rule: **approved anywhere wins**, else pending, else rejected, else
 * new. `null` when nothing readable is left.
 *
 * The precedence is about sellability, not severity. A product approved in
 * Germany and rejected in the US can be sold, so nothing should nag about it;
 * a rejection only matters while nobody has approved it anywhere, and then it
 * is the most useful thing to say because it names an action the vendor has to
 * take in their account.
 */
export function aggregateApprovalStatus(product) {
  const list = product?.approval_status_list;
  if (!Array.isArray(list)) return null;
  const found = new Set(list.filter(isActive).map(readStatus).filter(Boolean));
  return PRECEDENCE.find((status) => found.has(status)) ?? null;
}

/** Product keys grouped by state. Unreadable statuses (null) appear nowhere. */
export function classifyStatuses(statuses) {
  const grouped = { approved: [], pending: [], rejected: [], unrequested: [], unknown: [] };
  // A cache written by another version — or by hand — may hold anything.
  if (!statuses || typeof statuses !== "object" || Array.isArray(statuses)) return grouped;
  for (const [key, entry] of Object.entries(statuses)) {
    if (entry?.status === "approved") grouped.approved.push(key);
    else if (entry?.status === "pending") grouped.pending.push(key);
    else if (entry?.status === "rejected") grouped.rejected.push(key);
    else if (entry?.status === "new") grouped.unrequested.push(key);
    else grouped.unknown.push(key);
  }
  return grouped;
}

/** Every synced product approved — the state that earns the longer interval. */
export function allApproved(result) {
  const statuses = result?.statuses;
  if (!statuses || typeof statuses !== "object" || Array.isArray(statuses)) return false;
  const entries = Object.values(statuses);
  return entries.length > 0 && entries.every((e) => e?.status === "approved");
}

/** The product ids a cache describes, sorted — the cache's identity. */
function cachedIds(cache) {
  const statuses = cache?.statuses;
  if (!statuses || typeof statuses !== "object" || Array.isArray(statuses)) return null;
  return Object.values(statuses)
    .map((e) => String(e?.productId))
    .sort();
}

/**
 * How long yesterday's answer holds: 0 when it describes a different set of
 * products (then it is not an old answer, it is an answer to another
 * question), a week when everything is approved, otherwise a day.
 *
 * The product comparison comes FIRST. Putting it behind the all-approved
 * shortcut is how the first version of this let a freshly synced product go
 * unmentioned for a day — the shortcut bailed out before the comparison was
 * ever reached, and the test passed because it asserted the returned number
 * rather than whether the cache was refetched.
 */
export function ttlFor(cache, productIds) {
  const cached = cachedIds(cache);
  if (!cached) return 0;
  const wanted = productIds.map(String).sort();
  if (cached.length !== wanted.length) return 0;
  if (cached.some((id, i) => id !== wanted[i])) return 0;
  return allApproved(cache) ? WEEK : DAY;
}

/** At most this many product keys are named in one greeting line. */
const NAME_LIMIT = 3;

function nameSome(keys) {
  const shown = keys.slice(0, NAME_LIMIT).map((k) => `"${k}"`).join(", ");
  const rest = keys.length - NAME_LIMIT;
  return rest > 0 ? `${shown} +${rest} more` : shown;
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
  if (grouped.rejected.length > 0) {
    return (
      `[DS24: approval REJECTED for ${nameSome(grouped.rejected)} — read the reason in ` +
      `your Digistore24 account, fix it there, then node run.mjs ds24-approval --apply]`
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

/**
 * Should the check ask the API at all? Pure, so the three preconditions AC 3
 * turns on can be tested without a network or an `.env` — the version of this
 * that lived inline shipped with a kill switch that silenced the greeting and
 * left doctor talking, and no test could have caught it.
 */
export function shouldCheck({ killSwitch, apiKey, productIds }) {
  if (String(killSwitch ?? "").toLowerCase() === "off") return false;
  if (!apiKey) return false;
  return Array.isArray(productIds) && productIds.length > 0;
}

/** Park the answer in .dev/ for the day. A failure here is not worth a word. */
export function writeApprovalCache(result) {
  try {
    mkdirSync(dirname(CACHE_PATH), { recursive: true });
    writeFileSync(CACHE_PATH, `${JSON.stringify(result)}\n`);
  } catch {
    /* then it asks again next session */
  }
}

/** The cached answer, or null when there is none this code can use. */
export function readApprovalCache(now = Date.now()) {
  try {
    const cache = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
    // An answer nobody has refreshed in a month is not a finding, it is a
    // leftover — the check was switched off, the key was removed, or the
    // products were unsynced. Reporting it as current is how doctor came to
    // announce "not requested yet" long after a product had been approved.
    if (Number(cache?.checkedAt) > 0 && now - Number(cache.checkedAt) > MAX_CACHE_AGE) return null;
    return cache;
  } catch {
    return null;
  }
}

/**
 * A request was just applied, or the check was switched off — either way
 * yesterday's cached answer is now wrong or unwanted, and doctor reads that
 * file without knowing any of it.
 */
export function dropApprovalCache() {
  try {
    rmSync(CACHE_PATH, { force: true });
  } catch {
    /* a cache that cannot be deleted expires on its own */
  }
}

/**
 * listProducts response → the aggregated status per registry key.
 *
 * @param {[string, { productId: string }][]} entries
 * @param {unknown[]} list
 * @returns {Record<string, { productId: string, status: string | null }>}
 */
export function statusesFrom(entries, list) {
  const byId = new Map(
    list.filter((p) => p && typeof p === "object").map((p) => [String(idOf(p)), p]),
  );
  /** @type {Record<string, { productId: string, status: string | null }>} */
  const statuses = {};
  for (const [key, def] of entries) {
    statuses[key] = {
      productId: String(def.productId),
      status: aggregateApprovalStatus(byId.get(String(def.productId)) ?? null),
    };
  }
  return statuses;
}

/**
 * The cached answer — `{ checkedAt, statuses: { key: { productId, status } } }`
 * — refreshed with one listProducts call when it is due, and `null` whenever
 * the question cannot be answered: no key, nothing synced, switched off,
 * offline, malformed anything.
 */
export async function approvalReport(now = Date.now()) {
  try {
    // Imported HERE and not at the top of the file. `_client.mjs` reads the
    // `.env` while it is being imported (`scripts/lib/env.mjs` calls
    // `loadEnv()` at module scope), and this function runs inside the session
    // greeting. A module that throws while being imported takes the whole
    // greeting with it — before any `try` in any function body can run — and
    // `template/CLAUDE.md` tells the agent to read a missing greeting as "this
    // machine has no Node". A `.env` that exists but cannot be read (mode 600
    // from a container, root-owned) did exactly that.
    const { ds24Call } = await import("./_client.mjs");

    let entries;
    try {
      entries = Object.entries(readProducts().products).filter(([, def]) => def.productId);
    } catch {
      return null;
    }
    const productIds = entries.map(([, def]) => String(def.productId));

    if (!shouldCheck({
      killSwitch: process.env.DIGISTORE_APPROVAL_CHECK,
      apiKey: process.env.DIGISTORE_API_KEY,
      productIds,
    })) {
      // doctor reads the file directly and knows nothing about the switch or
      // the key, so leaving it behind would keep a silenced check talking.
      dropApprovalCache();
      return null;
    }

    const cache = readApprovalCache(now);
    if (!isDue(cache, now, ttlFor(cache, productIds))) return cache;

    // A "cannot answer" is remembered for the same day as an answer — an
    // offline machine pays one failed request, not one per session.
    const quiet = () => {
      writeApprovalCache({ checkedAt: now, statuses: null });
      return null;
    };

    let list;
    try {
      list = extractProducts(
        await ds24Call("listProducts", process.env.DIGISTORE_API_KEY, {}, {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }),
      );
    } catch {
      return quiet();
    }

    const result = { checkedAt: now, statuses: statusesFrom(entries, list) };
    writeApprovalCache(result);
    return result;
  } catch {
    // Reached when something outside the inner guards threw — a malformed
    // response shape, an unwritable `.dev/`. Without remembering a quiet
    // answer here, every single session start would pay for a fresh
    // authenticated API call, for ever, with nobody able to notice.
    try {
      writeApprovalCache({ checkedAt: now, statuses: null });
    } catch {
      /* nothing left to do */
    }
    return null;
  }
}
