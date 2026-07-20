import { describe, it, expect } from "vitest";
import { isOwner, hasRole } from "./authz";

describe("isOwner", () => {
  it("nur 'owner' hat Betreiber-Rechte", () => {
    expect(isOwner("owner")).toBe(true);
    expect(isOwner("member")).toBe(false);
    expect(isOwner(undefined)).toBe(false);
    expect(isOwner(null)).toBe(false);
    expect(isOwner("Owner")).toBe(false); // case-sensitiv (kanonischer Wert)
  });
});

describe("hasRole", () => {
  it("prüft Mitgliedschaft in der erlaubten Liste", () => {
    expect(hasRole("owner", ["owner", "member"])).toBe(true);
    expect(hasRole("member", ["owner"])).toBe(false);
    expect(hasRole(undefined, ["owner", "member"])).toBe(false);
    expect(hasRole(null, ["member"])).toBe(false);
  });
});
