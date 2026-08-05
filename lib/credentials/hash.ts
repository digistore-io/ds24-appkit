// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Password hashing — the TypeScript door to the one implementation.
//
// The implementation lives in `hash.mjs` next door (JSDoc-typed, zero
// TS-only syntax) so that plain-Node scripts can call the very same code —
// `scripts/users/smoke-account.mjs` hashes the smoke account's password with
// it. The pair is ONE implementation with two entrances, the same pattern as
// `lib/email-from.mjs`: security code with two copies is security code that
// drifts. The reasoning behind scrypt, the stored format and the timing
// behaviour is all in `hash.mjs`.
export { hashPassword, verifyPassword } from "./hash.mjs";
