import { describe, it, expect } from "vitest";
import { resolveRole, CANONICAL_ROLES } from "./_db.mjs";

describe("resolveRole", () => {
  it("akzeptiert kanonische Rollen", () => {
    expect(resolveRole("owner")).toBe("owner");
    expect(resolveRole("member")).toBe("member");
  });

  it("mappt Aliase admin→owner, user→member", () => {
    expect(resolveRole("admin")).toBe("owner");
    expect(resolveRole("user")).toBe("member");
  });

  it("ist tolerant bei Groß-/Kleinschreibung und Leerzeichen", () => {
    expect(resolveRole(" Owner ")).toBe("owner");
    expect(resolveRole("ADMIN")).toBe("owner");
  });

  it("liefert null bei ungültiger oder fehlender Rolle", () => {
    expect(resolveRole("chef")).toBeNull();
    expect(resolveRole("")).toBeNull();
    expect(resolveRole(null)).toBeNull();
    expect(resolveRole(true)).toBeNull(); // --role ohne Wert
  });

  it("CANONICAL_ROLES enthält owner und member", () => {
    expect(CANONICAL_ROLES).toEqual(["owner", "member"]);
  });
});
