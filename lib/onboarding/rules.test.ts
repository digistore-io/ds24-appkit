// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";

import {
  progress,
  allDone,
  nextStep,
  shouldShowChecklist,
  type OnboardingStep,
} from "./rules";

const step = (id: string, done: boolean): OnboardingStep => ({ id, done });

describe("progress", () => {
  it("counts what is done against the total", () => {
    expect(progress([step("a", true), step("b", false)])).toEqual({
      done: 1,
      total: 2,
      percent: 50,
    });
  });

  it("rounds instead of printing a fraction into a width", () => {
    // 1/3 — the value that reaches `style={{ width: `${percent}%` }}`.
    expect(progress([step("a", true), step("b", false), step("c", false)])
      .percent).toBe(33);
  });

  it("answers 0 for an empty list rather than NaN", () => {
    // NaN reaches the DOM as `width: NaN%` and renders as a FULL bar in some
    // browsers — a completed onboarding for an app that declared no steps.
    expect(progress([])).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it("reaches exactly 100 when everything is done", () => {
    expect(progress([step("a", true), step("b", true)]).percent).toBe(100);
  });
});

describe("allDone", () => {
  it("is false for an empty list", () => {
    // `[].every(…)` is true, which would make "no steps" indistinguishable
    // from "finished" — and the card would claim an onboarding nobody had.
    expect(allDone([])).toBe(false);
  });

  it("is false while one step is open", () => {
    expect(allDone([step("a", true), step("b", false)])).toBe(false);
  });

  it("is true when every step is done", () => {
    expect(allDone([step("a", true), step("b", true)])).toBe(true);
  });
});

describe("nextStep", () => {
  it("is the first open step", () => {
    expect(nextStep([step("a", true), step("b", false), step("c", false)])?.id)
      .toBe("b");
  });

  it("stays on the first open step even when a later one is done", () => {
    // The steps are a SET, not a sequence — buying tokens before looking at
    // the account is a normal order of events, and it must not tick the step
    // in front of it.
    expect(nextStep([step("a", false), step("b", true)])?.id).toBe("a");
  });

  it("is null when there is nothing left", () => {
    expect(nextStep([step("a", true)])).toBeNull();
    expect(nextStep([])).toBeNull();
  });
});

describe("shouldShowChecklist", () => {
  it("hides an app that declared no steps", () => {
    expect(shouldShowChecklist([])).toBe(false);
  });

  it("shows while anything is open", () => {
    expect(shouldShowChecklist([step("a", false)])).toBe(true);
    expect(shouldShowChecklist([step("a", true), step("b", false)])).toBe(true);
  });

  it("hides once everything is done — the card leaves by being finished", () => {
    expect(shouldShowChecklist([step("a", true), step("b", true)])).toBe(false);
  });

  it("comes back when a step goes back to undone", () => {
    // A refund takes the plan away again. The card returning is CORRECT: the
    // customer's access really did change, and this is the case a stored tick
    // would silently get wrong.
    const after = [step("plan", false), step("tokens", true)];
    expect(shouldShowChecklist(after)).toBe(true);
    expect(nextStep(after)?.id).toBe("plan");
  });
});
