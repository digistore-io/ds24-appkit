// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The smoke account's refusals, pinned.
//
// smoke-account.mjs writes a password-bearing member row into a PRODUCTION
// database and a credential into the local .env — the decisions around that
// write are security decisions, and they live in pure functions precisely so
// this file can hold them still:
//
//  - an operator account never gets a script-held password attached (a leaked
//    .env must never open an admin surface),
//  - a blocked account is never quietly un-blocked by a provisioning tool,
//  - the write refuses a localhost DATABASE_URL — the smoke account exists
//    for DEPLOYED apps; locally the development login covers smoke already.
//
// If one of these assertions fails, the change did not "improve" the script —
// it removed a refusal somebody relied on.
import { describe, it, expect } from "vitest";
import {
  defaultSmokeEmail,
  isLocalDatabaseUrl,
  smokeAccountProblems,
  generatePassword,
} from "./smoke-account.mjs";

describe("defaultSmokeEmail", () => {
  it("derives smoke@<host> from the deployed URL", () => {
    expect(defaultSmokeEmail("https://app.example.de")).toBe("smoke@app.example.de");
    expect(defaultSmokeEmail("https://app.example.de/")).toBe("smoke@app.example.de");
    expect(defaultSmokeEmail("https://App.Example.DE/some/path")).toBe("smoke@app.example.de");
  });

  it("returns null when there is no usable URL", () => {
    expect(defaultSmokeEmail(undefined)).toBeNull();
    expect(defaultSmokeEmail("")).toBeNull();
    expect(defaultSmokeEmail("not a url")).toBeNull();
  });
});

describe("isLocalDatabaseUrl", () => {
  it("recognises this machine", () => {
    expect(isLocalDatabaseUrl("postgres://app:pw@localhost:5432/app")).toBe(true);
    expect(isLocalDatabaseUrl("postgres://app:pw@127.0.0.1:5432/app")).toBe(true);
    expect(isLocalDatabaseUrl("postgres://app:pw@[::1]:5432/app")).toBe(true);
  });

  it("treats a remote host as remote", () => {
    expect(isLocalDatabaseUrl("postgres://app:pw@db.railway.internal:5432/app")).toBe(false);
    expect(isLocalDatabaseUrl("postgres://app:pw@ep-x.eu-central-1.aws.neon.tech/app")).toBe(false);
  });

  it("does not claim 'local' for something it cannot parse", () => {
    expect(isLocalDatabaseUrl(undefined)).toBe(false);
    expect(isLocalDatabaseUrl("")).toBe(false);
  });
});

describe("smokeAccountProblems", () => {
  const remote = "postgres://app:pw@db.example.net:5432/app";

  it("is empty for the good case: remote DB, fresh address", () => {
    expect(
      smokeAccountProblems({ databaseUrl: remote, email: "smoke@app.example.de" }),
    ).toEqual([]);
  });

  it("accepts an existing MEMBER row — that is the rotation case", () => {
    expect(
      smokeAccountProblems({
        databaseUrl: remote,
        email: "smoke@app.example.de",
        existingRole: "member",
      }),
    ).toEqual([]);
  });

  it("refuses a localhost DATABASE_URL, naming the fix", () => {
    const problems = smokeAccountProblems({
      databaseUrl: "postgres://app:pw@localhost:5432/app",
      email: "smoke@app.example.de",
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("DATABASE_URL");
    expect(problems[0]).toContain("node run.mjs smoke-account --apply");
  });

  it("refuses to attach a smoke password to an OWNER account", () => {
    const problems = smokeAccountProblems({
      databaseUrl: remote,
      email: "boss@app.example.de",
      existingRole: "owner",
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("OWNER");
  });

  it("refuses a blocked account instead of un-blocking it", () => {
    const problems = smokeAccountProblems({
      databaseUrl: remote,
      email: "smoke@app.example.de",
      existingRole: "member",
      existingBlockedAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("blocked");
  });

  it("refuses a run with no address at all, naming the APP_URL variable", () => {
    const problems = smokeAccountProblems({ databaseUrl: remote, email: null });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("APP_URL_PROD");
    expect(
      smokeAccountProblems({ databaseUrl: remote, email: null, envName: "staging" })[0],
    ).toContain("APP_URL_STAGING");
  });
});

describe("generatePassword", () => {
  it("is 32 chars of base64url — shell-safe, ~192 bits", () => {
    const pw = generatePassword();
    expect(pw).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("never repeats", () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });
});
