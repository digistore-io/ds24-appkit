// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";

import { apiConfig, apiConfigProblems, apiOffReason, isApiEnabled } from "./config";

describe("the shipped config/api.json", () => {
  it("is coherent — a problem here reaches every customer's clone", () => {
    expect(apiConfigProblems()).toEqual([]);
  });

  it("ships with the API off", () => {
    // The shipped state is the security decision: an API nobody decided to
    // offer must not answer. Turning it on is a deliberate act (docs/api.md).
    expect(apiConfig().enabled).toBe(false);
    expect(isApiEnabled()).toBe(false);
    expect(apiOffReason()).toBe("disabledInConfig");
  });

  it("gates on nothing by default", () => {
    // `requiresPlan: null` means every member — the per-member question is
    // hasPlan() in the guard, never here.
    expect(apiConfig().requiresPlan).toBeNull();
  });
});
