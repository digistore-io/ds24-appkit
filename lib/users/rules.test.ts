import { describe, it, expect } from "vitest";
import {
  canDeleteUser,
  canChangeRole,
  canCreateUser,
  canBlockUser,
  canChangeEmail,
  canSendLoginLink,
  normalizeEmail,
} from "./rules";

const admin = { id: "u1", role: "owner" };
const secondAdmin = { id: "u2", role: "owner" };
const customer = { id: "u3", role: "member" };
const blockedCustomer = {
  id: "u4",
  role: "member",
  email: "blocked@example.com",
  blockedAt: new Date("2026-01-01"),
};

describe("canDeleteUser", () => {
  it("lets an admin delete a customer", () => {
    expect(canDeleteUser(admin, customer, 1)).toBeNull();
  });

  it("refuses non-admins", () => {
    expect(canDeleteUser(customer, admin, 2)).toBe("notOwner");
  });

  it("refuses deleting yourself", () => {
    expect(canDeleteUser(admin, admin, 2)).toBe("selfDelete");
  });

  it("refuses deleting the last admin", () => {
    expect(canDeleteUser(admin, secondAdmin, 1)).toBe("lastOwnerDelete");
  });

  it("allows deleting an admin while others remain", () => {
    expect(canDeleteUser(admin, secondAdmin, 2)).toBeNull();
  });
});

describe("canChangeRole", () => {
  it("lets an admin promote a customer to admin", () => {
    expect(canChangeRole(admin, customer, "owner", 1)).toBeNull();
  });

  it("refuses non-admins", () => {
    expect(canChangeRole(customer, customer, "owner", 1)).toBe("notOwner");
  });

  it("refuses demoting yourself", () => {
    expect(canChangeRole(admin, admin, "member", 2)).toBe("selfDemote");
  });

  it("refuses demoting the last admin", () => {
    expect(canChangeRole(admin, secondAdmin, "member", 1)).toBe("lastOwnerRole");
  });

  it("allows demoting an admin while others remain", () => {
    expect(canChangeRole(admin, secondAdmin, "member", 2)).toBeNull();
  });

  it("allows setting the role that already applies, as a no-op", () => {
    // Also for the last admin: owner -> owner changes nothing and is allowed.
    expect(canChangeRole(admin, admin, "owner", 1)).toBeNull();
  });
});

describe("canCreateUser", () => {
  it("allows admins", () => {
    expect(canCreateUser(admin)).toBeNull();
  });
  it("refuses customers", () => {
    expect(canCreateUser(customer)).toBe("notOwner");
  });
});

describe("canBlockUser", () => {
  it("lets an admin block a customer", () => {
    expect(canBlockUser(admin, customer, 1, true)).toBeNull();
  });

  it("refuses non-admins", () => {
    expect(canBlockUser(customer, admin, 2, true)).toBe("notOwner");
  });

  it("refuses blocking yourself", () => {
    // Otherwise nobody could reach the account to lift the block again.
    expect(canBlockUser(admin, admin, 2, true)).toBe("selfBlock");
  });

  it("refuses blocking the last admin", () => {
    expect(canBlockUser(admin, secondAdmin, 1, true)).toBe("lastOwnerBlock");
  });

  it("allows blocking an admin while others remain", () => {
    expect(canBlockUser(admin, secondAdmin, 2, true)).toBeNull();
  });

  it("always allows unblocking — even the last admin, even yourself", () => {
    // Unblocking grants nobody rights they did not already have. A state you
    // cannot get out of, on the other hand, would be a trap.
    expect(canBlockUser(admin, secondAdmin, 1, false)).toBeNull();
    expect(canBlockUser(admin, admin, 1, false)).toBeNull();
  });

  it("refuses unblocking too when the actor is not an admin", () => {
    expect(canBlockUser(customer, blockedCustomer, 2, false)).toBe("notOwner");
  });
});

describe("canChangeEmail", () => {
  it("allows admins", () => {
    expect(canChangeEmail(admin)).toBeNull();
  });
  it("refuses customers", () => {
    expect(canChangeEmail(customer)).toBe("notOwner");
  });
});

describe("canSendLoginLink", () => {
  const customerWithEmail = { ...customer, email: "customer@example.com" };

  it("lets an admin send a customer a link", () => {
    expect(canSendLoginLink(admin, customerWithEmail)).toBeNull();
  });

  it("refuses non-admins", () => {
    expect(canSendLoginLink(customer, customerWithEmail)).toBe("notOwner");
  });

  it("refuses accounts without an email address", () => {
    expect(canSendLoginLink(admin, { ...customer, email: null })).toBe(
      "userWithoutEmail",
    );
  });

  it("refuses blocked accounts", () => {
    // A link that invites you to sign in and is then rejected only confuses —
    // the block applies anyway (auth.ts).
    expect(canSendLoginLink(admin, blockedCustomer)).toBe("userBlocked");
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Owner@Example.COM ")).toBe("owner@example.com");
  });

  it("rejects unusable input", () => {
    for (const bad of ["", "no-at", "a@b", "a b@c.de", null, 42, undefined]) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });
});
