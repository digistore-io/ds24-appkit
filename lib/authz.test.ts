import { describe, it, expect } from "vitest";
import { isOwner, hasRole } from "./authz";

describe("isOwner", () => {
  it("only 'owner' carries operator rights", () => {
    expect(isOwner("owner")).toBe(true);
    expect(isOwner("member")).toBe(false);
    expect(isOwner(undefined)).toBe(false);
    expect(isOwner(null)).toBe(false);
    expect(isOwner("Owner")).toBe(false); // case-sensitive (canonical value)
  });
});

describe("hasRole", () => {
  it("checks membership in the allowed list", () => {
    expect(hasRole("owner", ["owner", "member"])).toBe(true);
    expect(hasRole("member", ["owner"])).toBe(false);
    expect(hasRole(undefined, ["owner", "member"])).toBe(false);
    expect(hasRole(null, ["member"])).toBe(false);
  });
});
