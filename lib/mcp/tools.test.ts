// The registry's invariants — the ones that keep a tool from becoming a hole.
//
// None of this touches the database. It asserts the SHAPE of the tool list,
// which is what somebody changes when they add their own tools, and it is the
// reason a mistake there breaks the build instead of the customer's first call.
import { describe, expect, it } from "vitest";

import { TOOLS, findTool, toolListPayload } from "./tools";
import { mcpConfig, mcpConfigProblems } from "./config";
import { findProduct } from "@/lib/digistore/products";

describe("the tool registry", () => {
  it("has unique names", () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("uses names a client will accept", () => {
    // Lower-case, no spaces. Clients key their own tool tables on these, and a
    // model has to be able to repeat one exactly.
    for (const tool of TOOLS) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]{1,63}$/);
    }
  });

  it("describes every tool well enough for a model to choose it", () => {
    // The single highest-leverage string in the file — a one-word description
    // is why a model never calls a tool that would have answered the question.
    for (const tool of TOOLS) {
      expect(tool.description.length).toBeGreaterThan(30);
    }
  });

  it("gives every tool a JSON-Schema object for its arguments", () => {
    for (const tool of TOOLS) {
      expect(tool.inputSchema.type).toBe("object");
      // `additionalProperties: false` is what stops a model inventing an
      // argument the handler then reads off `args` by accident.
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }
  });

  it("never marks a tool that costs money as read-only", () => {
    // THE invariant of this file. `readOnly` is the security boundary a `read`
    // key is measured against (lib/mcp/rules.ts → mayRun); a charging tool
    // wearing that flag is a read-only key that can spend somebody's balance.
    for (const tool of TOOLS) {
      if (tool.costTokens > 0) expect(tool.readOnly).toBe(false);
    }
  });

  it("prices every tool as a whole, non-negative number of tokens", () => {
    for (const tool of TOOLS) {
      expect(Number.isInteger(tool.costTokens)).toBe(true);
      expect(tool.costTokens).toBeGreaterThanOrEqual(0);
    }
  });

  it("gates only on plans that exist and can actually be held", () => {
    // A `requiresPlan` naming a deleted product would throw "unknown product
    // key" out of hasPlan() against a customer's first call — where the error
    // reaches a model, not a person. And a TOKEN package can never satisfy it:
    // a balance is not an entitlement, so hasPlan() answers false for one for
    // ever, locking out exactly the customers who paid.
    for (const tool of TOOLS) {
      if (!tool.requiresPlan) continue;
      const product = findProduct(tool.requiresPlan);
      expect(
        product,
        `tool "${tool.name}" gates on "${tool.requiresPlan}", which is not in config/digistore-products.json`,
      ).not.toBeNull();
      expect(
        product?.kind,
        `tool "${tool.name}" gates on the token package "${tool.requiresPlan}" — hasPlan() answers false for one for ever`,
      ).not.toBe("token");
    }
  });

  it("exposes no tool that acts on somebody other than the key's owner", () => {
    // Every argument is written by a model reading text somebody else may have
    // authored. A member/user/account id among them is an IDOR with a language
    // model holding the pen.
    const forbidden = ["memberid", "member_id", "userid", "user_id", "accountid", "account_id"];
    for (const tool of TOOLS) {
      const properties = (tool.inputSchema.properties ?? {}) as Record<string, unknown>;
      for (const name of Object.keys(properties)) {
        expect(
          forbidden,
          `tool "${tool.name}" takes an argument called "${name}" — the account acted on must come from the key, never from the arguments`,
        ).not.toContain(name.toLowerCase());
      }
    }
  });

  it("finds a tool by name and nothing by a name it does not have", () => {
    expect(findTool(TOOLS[0].name)).toBe(TOOLS[0]);
    expect(findTool("does_not_exist")).toBeNull();
  });

  it("cannot be extended at runtime", () => {
    // What makes `capabilities.tools.listChanged: false` a true statement.
    expect(Object.isFrozen(TOOLS)).toBe(true);
  });
});

describe("toolListPayload", () => {
  it("sends the read-only hint that matches the tool", () => {
    const payload = toolListPayload();
    expect(payload.tools).toHaveLength(TOOLS.length);
    for (const entry of payload.tools) {
      const tool = findTool(entry.name);
      expect(entry.annotations.readOnlyHint).toBe(tool?.readOnly);
    }
  });
});

describe("config/mcp.json", () => {
  it("is coherent", () => {
    // Same deal `lib/billing-mode.test.ts` and `lib/ai/chat-config.test.ts`
    // make: a second source of truth is only safe while something checks it
    // against the first.
    expect(mcpConfigProblems()).toEqual([]);
  });

  it("names a server", () => {
    // It is what a client shows next to the customer's key. An empty one leaves
    // them looking at a connector with no name.
    expect(mcpConfig().serverName.trim()).not.toBe("");
  });

  it("only claims to be on when there is something to be on for", () => {
    // Deliberately NOT "ships switched off": the `mcp-server` skill turns it on
    // in the customer's own app, and a test asserting the shipped value would
    // then fail for every customer who followed the instructions. What holds in
    // both states is this — an enabled server with no tools answers `tools/list`
    // with an empty array, which reads to a model as a broken connector.
    if (mcpConfig().enabled) expect(TOOLS.length).toBeGreaterThan(0);
  });
});
