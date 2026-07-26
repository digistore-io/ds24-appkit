// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The IPN log: record every incoming IPN at the edge, and read it back for the
// Operator's "IPN-Log" tab (app/dashboard/admin/purchases).
//
// This is a DIAGNOSTIC log, not a financial record. Its whole point is to be
// visible even when no order results — a bad signature, a connection test, a
// processing error. So recording must NEVER change the request's outcome:
// recordIpnEvent swallows its own failures (a log that breaks the webhook is
// worse than a missing log line). The order table remains the source of truth
// for money; see lib/digistore/payment-event.ts.
//
// PII-free and secret-free by construction — see the `ipnEvents` table comment.
import { db } from "@/db";
import { ipnEvents } from "@/db/schema";
import { desc, lt } from "drizzle-orm";

export type IpnResult =
  | "accepted"
  | "invalid_signature"
  | "connection_test"
  | "not_configured"
  | "error";

// What the edge should DO with a request, decided from the three facts it knows
// before any processing: is a passphrase configured, did the signature verify,
// and what event is claimed. Pure and total so it can be tested exhaustively —
// the route (app/api/ipn/route.ts) turns each verdict into a response and a log
// row. "process" is the only verdict that hands off to onPaymentEvent; the
// accepted/error split is decided by THAT call, not here.
export type IpnDisposition =
  | "not_configured"
  | "invalid_signature"
  | "connection_test"
  | "process";

export function classifyIpnRequest(input: {
  hasPassphrase: boolean;
  signatureValid: boolean;
  event: string;
}): IpnDisposition {
  // Order mirrors the edge: fail closed first. Without a passphrase nothing is
  // trusted; a bad signature is rejected before the event is even looked at.
  if (!input.hasPassphrase) return "not_configured";
  if (!input.signatureValid) return "invalid_signature";
  if (input.event === "connection_test") return "connection_test";
  return "process";
}

export interface RecordIpnInput {
  event: string | null;
  ds24OrderId: string | null;
  ds24PurchaseId: string | null;
  signatureValid: boolean;
  result: IpnResult;
  detail?: string | null;
  // The full raw request body, stored verbatim for diagnostics. Buyer PII, so
  // it is pruned after 60 days (see pruneIpnEvents).
  payload?: string | null;
}

// Insert one log row. Fails silent (console.warn only): the IPN response must
// not hinge on the log write succeeding.
export async function recordIpnEvent(input: RecordIpnInput): Promise<void> {
  try {
    await db.insert(ipnEvents).values({
      event: input.event,
      ds24OrderId: input.ds24OrderId,
      ds24PurchaseId: input.ds24PurchaseId,
      signatureValid: input.signatureValid,
      result: input.result,
      detail: input.detail ?? null,
      payload: input.payload ?? null,
    });
  } catch (error) {
    console.warn("[ipn] could not record IPN log entry:", error);
  }
}

export interface IpnLogRow {
  id: string;
  receivedAt: Date;
  event: string | null;
  ds24OrderId: string | null;
  ds24PurchaseId: string | null;
  signatureValid: boolean;
  result: IpnResult;
  detail: string | null;
  payload: string | null;
}

// Newest first, capped — the log is for eyeballing recent traffic, not an audit
// export. The receiving index (ipn_events_received) serves the ordering.
export async function listIpnEvents(limit = 200): Promise<IpnLogRow[]> {
  return db
    .select({
      id: ipnEvents.id,
      receivedAt: ipnEvents.receivedAt,
      event: ipnEvents.event,
      ds24OrderId: ipnEvents.ds24OrderId,
      ds24PurchaseId: ipnEvents.ds24PurchaseId,
      signatureValid: ipnEvents.signatureValid,
      result: ipnEvents.result,
      detail: ipnEvents.detail,
      payload: ipnEvents.payload,
    })
    .from(ipnEvents)
    .orderBy(desc(ipnEvents.receivedAt))
    .limit(limit);
}

// --- Retention ---------------------------------------------------------------
// The log holds the full raw payload (buyer PII), so it is not kept forever.
// The prune job (scripts/db/prune-ipn-log.mjs, /api/cron/prune-ipn-log) deletes
// everything older than the cutoff. 60 days is long enough to investigate a
// failed webhook and short enough to be defensible as data minimisation.
export const IPN_LOG_RETENTION_DAYS = 60;

// Pure: the timestamp before which rows are stale. Split out so the retention
// arithmetic is testable without a clock or a database.
export function ipnLogCutoff(now: Date, retentionDays = IPN_LOG_RETENTION_DAYS): Date {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

// Delete every log entry older than the cutoff; returns how many rows went.
export async function pruneIpnEvents(
  now: Date = new Date(),
  retentionDays = IPN_LOG_RETENTION_DAYS,
): Promise<number> {
  const cutoff = ipnLogCutoff(now, retentionDays);
  const deleted = await db
    .delete(ipnEvents)
    .where(lt(ipnEvents.receivedAt, cutoff))
    .returning({ id: ipnEvents.id });
  return deleted.length;
}
