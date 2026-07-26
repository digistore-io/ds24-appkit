// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import { RESELLERS, resellerForLang, resolveReseller } from "./_resellers.mjs";

describe("resellerForLang", () => {
  it("picks the Germany reseller (id 1) for German", () => {
    expect(resellerForLang("de").id).toBe("1");
    expect(resellerForLang("DE").id).toBe("1");
    expect(resellerForLang("de-DE").id).toBe("1");
    expect(resellerForLang(" de ").id).toBe("1");
  });

  it("picks the USA reseller (id 2) for everything else", () => {
    expect(resellerForLang("en").id).toBe("2");
    expect(resellerForLang("fr").id).toBe("2");
    expect(resellerForLang("").id).toBe("2");
    expect(resellerForLang(undefined).id).toBe("2");
  });
});

describe("resolveReseller", () => {
  it("derives it from the language when nothing is given (default flow)", () => {
    expect(resolveReseller({ lang: "de" })).toEqual({
      id: "1",
      source: "lang",
      reseller: RESELLERS.DE,
    });
    expect(resolveReseller({ lang: "en" }).id).toBe("2");
    expect(resolveReseller({ lang: "en" }).source).toBe("lang");
  });

  it("always lets an explicit siteowner ID win", () => {
    const r = resolveReseller({ siteowner: "4711", reseller: "US", lang: "de" });
    expect(r).toEqual({ id: "4711", source: "siteowner", reseller: null });
  });

  it("accepts a reseller country code (case-insensitive)", () => {
    expect(resolveReseller({ reseller: "us", lang: "de" }).id).toBe("2");
    expect(resolveReseller({ reseller: "GB" }).id).toBe("3");
    expect(resolveReseller({ reseller: "ie" }).source).toBe("reseller");
  });

  it("ignores empty values and falls back to the language", () => {
    expect(resolveReseller({ siteowner: "  ", reseller: "", lang: "de" }).id).toBe("1");
  });

  it("throws on an unknown reseller key", () => {
    expect(() => resolveReseller({ reseller: "XX" })).toThrow(/Unknown reseller/);
  });
});
