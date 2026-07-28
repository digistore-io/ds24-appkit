// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The approval line is read by everybody who opens a project with synced
// products, and its data comes from an UNDOCUMENTED response shape (see
// _approval.mjs). So the two things worth pinning down are: the normalizer
// against the probed shape and every way it can degrade, and the line itself
// — which state wins, and when it stays silent.
import { describe as suite, expect, it } from "vitest";
import {
  allApproved,
  approvalStatusOf,
  classifyStatuses,
  describeApproval,
  ttlFor,
} from "./_approval.mjs";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** One item as the probe recorded it (2026-07-28, product 715507). */
const product = (statusByReseller: Record<string, string>) => ({
  id: "715507",
  name_intern: "fokus_sprint_7",
  approval_status: "", // the top-level field is empty on the live API — legacy
  approval_status_list: Object.entries(statusByReseller).map(([id, status]) => ({
    reseller_id: id,
    reseller_name: `DS-${id}`,
    approval_status: status,
    approval_status_msg: status,
    is_siteowner_active: "Y",
    modified_at: null,
    approval_reject_reason: [],
    approval_reject_reason_msg: "",
    approval_reject_reason_description: "",
  })),
});

suite("approvalStatusOf", () => {
  it("reads the entry for the asked siteowner, not the first one", () => {
    const p = product({ "1": "approved", "2": "new" });
    expect(approvalStatusOf(p, "1")).toBe("approved");
    expect(approvalStatusOf(p, "2")).toBe("new");
  });

  it("takes a numeric siteowner id — the resellers file hands out strings, callers may not", () => {
    expect(approvalStatusOf(product({ "1": "pending" }), 1)).toBe("pending");
  });

  it("answers null for a siteowner the list does not carry (a private marketplace)", () => {
    expect(approvalStatusOf(product({ "1": "new" }), "9999")).toBeNull();
  });

  it("answers null when the list is missing — the shape is undocumented and may change", () => {
    expect(approvalStatusOf({ id: "1", approval_status: "approved" }, "1")).toBeNull();
    expect(approvalStatusOf(null, "1")).toBeNull();
  });

  it("answers null for a value it does not know, instead of guessing", () => {
    expect(approvalStatusOf(product({ "1": "in_review" }), "1")).toBeNull();
  });

  it("normalizes case and whitespace", () => {
    expect(approvalStatusOf(product({ "1": " Approved " }), "1")).toBe("approved");
  });
});

suite("classifyStatuses", () => {
  it("groups by state and drops the unreadable", () => {
    const grouped = classifyStatuses({
      a: { productId: "1", status: "approved" },
      b: { productId: "2", status: "pending" },
      c: { productId: "3", status: "rejected" },
      d: { productId: "4", status: "new" },
      e: { productId: "5", status: null },
    });
    expect(grouped).toEqual({
      approved: ["a"],
      pending: ["b"],
      rejected: ["c"],
      unrequested: ["d"],
    });
  });

  it("takes the null that a quiet cache holds", () => {
    expect(classifyStatuses(null)).toEqual({
      approved: [],
      pending: [],
      rejected: [],
      unrequested: [],
    });
  });
});

suite("describeApproval", () => {
  const result = (statuses: Record<string, string | null>) => ({
    checkedAt: 0,
    siteowner: "1",
    statuses: Object.fromEntries(
      Object.entries(statuses).map(([key, status], i) => [key, { productId: String(i), status }]),
    ),
  });

  it("says nothing when everything is approved", () => {
    expect(describeApproval(result({ a: "approved", b: "approved" }))).toBeNull();
  });

  it("says nothing when it could not answer", () => {
    expect(describeApproval(null)).toBeNull();
    expect(describeApproval({ checkedAt: 0, siteowner: "1", statuses: null })).toBeNull();
    expect(describeApproval(result({ a: null }))).toBeNull();
  });

  it("points at the go-live step while nothing was requested", () => {
    const line = describeApproval(result({ a: "new", b: "new", c: "approved" }));
    expect(line).toContain("2 product(s) not submitted");
    expect(line).toContain("node run.mjs ds24-approval --apply");
    expect(line).toContain("test purchases");
  });

  it("reports pending without asking for action — the vendor already acted", () => {
    const line = describeApproval(result({ a: "pending", b: "approved" }));
    expect(line).toContain("pending for 1 product(s)");
    expect(line).not.toContain("--apply");
  });

  it("lets rejected win over everything, and names the product", () => {
    const line = describeApproval(result({ a: "rejected", b: "new", c: "pending" }));
    expect(line).toContain('REJECTED for "a"');
    expect(line).toContain("Digistore24 account");
  });

  it("is one line, never one per product", () => {
    const line = describeApproval(result({ a: "new", b: "pending", c: "rejected" }));
    expect(line).not.toContain("\n");
  });
});

suite("ttlFor", () => {
  const approvedCache = {
    checkedAt: 0,
    siteowner: "1",
    statuses: {
      a: { productId: "10", status: "approved" },
      b: { productId: "11", status: "approved" },
    },
  };

  it("holds a day while anything is not approved", () => {
    expect(ttlFor(null, "1", ["10"])).toBe(DAY);
    expect(
      ttlFor(
        { siteowner: "1", statuses: { a: { productId: "10", status: "pending" } } },
        "1",
        ["10"],
      ),
    ).toBe(DAY);
  });

  it("stretches to a week once everything is approved", () => {
    expect(ttlFor(approvedCache, "1", ["10", "11"])).toBe(WEEK);
    // Order of the ids must not matter — the registry is an object.
    expect(ttlFor(approvedCache, "1", ["11", "10"])).toBe(WEEK);
  });

  it("snaps back when the products or the marketplace change", () => {
    expect(ttlFor(approvedCache, "2", ["10", "11"])).toBe(DAY);
    expect(ttlFor(approvedCache, "1", ["10", "11", "12"])).toBe(DAY);
    expect(ttlFor(approvedCache, "1", ["10"])).toBe(DAY);
  });

  it("treats a quiet cache (statuses null) as a day", () => {
    expect(ttlFor({ checkedAt: 0, siteowner: "1", statuses: null }, "1", ["10"])).toBe(DAY);
  });
});

suite("allApproved", () => {
  it("needs at least one product — an empty answer is not an approval", () => {
    expect(allApproved({ statuses: {} })).toBe(false);
    expect(allApproved(null)).toBe(false);
  });
});
