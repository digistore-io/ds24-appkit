// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The MCP endpoint's own limits.
//
// Everything about the KEYS — format, scopes, lifetimes, states, the member's
// error codes — lives in `lib/api-keys/rules.ts`, shared with the HTTP API:
// one credential system, two audiences. What remains here is what is genuinely
// the MCP endpoint's: its rate buckets.
import type { Limit } from "@/lib/rate-limit";

/** Bucket name for `lib/rate-limit.ts`, keyed by member id. */
export const MCP_RATE_BUCKET = "mcp";

/**
 * Calls one member may make in a minute, across all their keys.
 *
 * Keyed by MEMBER and not by key, on purpose: metering per key would let
 * somebody multiply their own ceiling by creating more of them, which is the
 * one thing the account page hands out freely.
 *
 * An AI client is bursty — a model plans, then fires several tool calls at
 * once — so this is set well above a human's pace and is a runaway brake, not a
 * pricing lever. What a call COSTS is `spendTokens` (see lib/mcp/tools.ts).
 */
export const CALL_LIMIT: Limit = { max: 120, windowMs: 60_000 };

/**
 * Failed authentications tolerated from one origin in a quarter hour.
 *
 * Keyed by origin rather than by key: a wrong key has no member to meter
 * against, and the thing worth stopping is somebody trying many keys, which the
 * per-key view cannot see. Same shape and the same reasoning as the password
 * sprint limit in `lib/credentials/rules.ts`.
 */
export const AUTH_FAIL_BUCKET = "mcp-auth";
export const AUTH_FAIL_LIMIT: Limit = { max: 30, windowMs: 15 * 60_000 };
