import { describe, it, expect } from "vitest";
import {
  canDeleteUser,
  canChangeRole,
  canCreateUser,
  normalizeEmail,
} from "./rules";

const admin = { id: "u1", role: "owner" };
const zweiterAdmin = { id: "u2", role: "owner" };
const kunde = { id: "u3", role: "member" };

describe("canDeleteUser", () => {
  it("erlaubt einem Admin, einen Kunden zu löschen", () => {
    expect(canDeleteUser(admin, kunde, 1)).toBeNull();
  });

  it("verbietet Nicht-Admins das Löschen", () => {
    expect(canDeleteUser(kunde, admin, 2)).toMatch(/Nur Admins/);
  });

  it("verbietet, sich selbst zu löschen", () => {
    expect(canDeleteUser(admin, admin, 2)).toMatch(/nicht selbst löschen/);
  });

  it("verbietet, den letzten Admin zu löschen", () => {
    expect(canDeleteUser(admin, zweiterAdmin, 1)).toMatch(/letzte Admin/);
  });

  it("erlaubt das Löschen eines Admins, wenn es noch andere gibt", () => {
    expect(canDeleteUser(admin, zweiterAdmin, 2)).toBeNull();
  });
});

describe("canChangeRole", () => {
  it("erlaubt einem Admin, einen Kunden zum Admin zu machen", () => {
    expect(canChangeRole(admin, kunde, "owner", 1)).toBeNull();
  });

  it("verbietet Nicht-Admins das Ändern von Rollen", () => {
    expect(canChangeRole(kunde, kunde, "owner", 1)).toMatch(/Nur Admins/);
  });

  it("verbietet die Selbst-Degradierung", () => {
    expect(canChangeRole(admin, admin, "member", 2)).toMatch(/nicht selbst/);
  });

  it("verbietet, den letzten Admin zu degradieren", () => {
    expect(canChangeRole(admin, zweiterAdmin, "member", 1)).toMatch(/letzte Admin/);
  });

  it("erlaubt das Degradieren eines Admins, wenn es noch andere gibt", () => {
    expect(canChangeRole(admin, zweiterAdmin, "member", 2)).toBeNull();
  });

  it("lässt das Setzen der bereits gültigen Rolle folgenlos zu", () => {
    // Auch für den letzten Admin: owner -> owner ändert nichts und ist erlaubt.
    expect(canChangeRole(admin, admin, "owner", 1)).toBeNull();
  });
});

describe("canCreateUser", () => {
  it("erlaubt es Admins", () => {
    expect(canCreateUser(admin)).toBeNull();
  });
  it("verbietet es Kunden", () => {
    expect(canCreateUser(kunde)).toMatch(/Nur Admins/);
  });
});

describe("normalizeEmail", () => {
  it("trimmt und kleinschreibt", () => {
    expect(normalizeEmail("  Chef@Example.DE ")).toBe("chef@example.de");
  });

  it("weist Unbrauchbares ab", () => {
    for (const bad of ["", "kein-at", "a@b", "a b@c.de", null, 42, undefined]) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });
});
