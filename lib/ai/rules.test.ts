import { describe, it, expect } from "vitest";

import {
  CHAT_ERROR_CODES,
  ChatError,
  MAX_MESSAGE_CHARS,
  chatLimit,
  checkMessage,
  hasControlChar,
  chatNavVisible,
  mayUseChat,
  trimHistory,
  type ChatTurn,
} from "./rules";

describe("checkMessage", () => {
  it("accepts an ordinary question and hands back the trimmed text", () => {
    const result = checkMessage("  How do I cancel?  ");
    expect(result).toEqual({ ok: true, text: "How do I cancel?" });
  });

  it("refuses anything that is not a string", () => {
    // A route handler is an HTTP endpoint of its own: the body is whatever the
    // caller sent, not whatever the form would have produced.
    for (const value of [undefined, null, 42, {}, [], true]) {
      expect(checkMessage(value), String(value)).toEqual({
        ok: false,
        code: "chatEmptyMessage",
      });
    }
  });

  it("refuses whitespace-only input, including the invisible kinds", () => {
    // `trim()` strips none of the last three. Without the letter-or-digit test
    // each of them would arrive as a question and be paid for.
    const zeroWidthSpace = String.fromCodePoint(0x200b);
    const brailleBlank = String.fromCodePoint(0x2800);
    const ideographicSpace = String.fromCodePoint(0x3000);
    for (const value of ["", "   ", "\n\t", zeroWidthSpace, brailleBlank, ideographicSpace]) {
      expect(checkMessage(value), JSON.stringify(value)).toEqual({
        ok: false,
        code: "chatEmptyMessage",
      });
    }
  });

  it("accepts punctuation as long as there is a letter or a digit", () => {
    expect(checkMessage("?!")).toEqual({ ok: false, code: "chatEmptyMessage" });
    expect(checkMessage("Why?!")).toEqual({ ok: true, text: "Why?!" });
    expect(checkMessage("2 + 2?")).toEqual({ ok: true, text: "2 + 2?" });
  });

  it("refuses a message over the character limit — at the boundary", () => {
    const atLimit = "a".repeat(MAX_MESSAGE_CHARS);
    expect(checkMessage(atLimit)).toEqual({ ok: true, text: atLimit });

    const overLimit = "a".repeat(MAX_MESSAGE_CHARS + 1);
    expect(checkMessage(overLimit)).toEqual({
      ok: false,
      code: "chatMessageTooLong",
    });
  });

  it("measures the length AFTER trimming", () => {
    // Otherwise a message padded with spaces is refused for a length it does
    // not have once it reaches the model.
    const padded = `  ${"a".repeat(MAX_MESSAGE_CHARS)}  `;
    expect(checkMessage(padded).ok).toBe(true);
  });

  it("refuses control characters that Postgres would reject later", () => {
    // The point of catching it here: the insert happens AFTER the model call,
    // so a NUL that slips through is paid for and then lost.
    const withNul = `hello${String.fromCharCode(0)}world`;
    expect(checkMessage(withNul)).toEqual({ ok: false, code: "chatEmptyMessage" });
  });

  it("lets newline, tab and carriage return through", () => {
    // Somebody pasting a two-line error message is asking a normal question.
    const pasted = "It says:\n\tError 500\r\nWhat now?";
    expect(checkMessage(pasted).ok).toBe(true);
  });
});

describe("hasControlChar", () => {
  it("finds the control characters and spares the three that are typed", () => {
    expect(hasControlChar("plain text")).toBe(false);
    expect(hasControlChar("with\ttab\nand\r\n")).toBe(false);
    for (const code of [0, 1, 8, 11, 12, 14, 27, 31, 127]) {
      expect(hasControlChar(`a${String.fromCharCode(code)}b`), `code ${code}`).toBe(
        true,
      );
    }
  });

  it("does not trip over characters outside the basic plane", () => {
    // Iterating by code unit rather than code point would split an emoji into
    // two surrogates — neither of which is a control character, but the bug is
    // the kind that shows up as "her answers reject emoji" much later.
    expect(hasControlChar("thanks 🙏")).toBe(false);
  });
});

describe("trimHistory", () => {
  const turn = (role: "user" | "assistant", n: number): ChatTurn => ({
    role,
    content: `${role} ${n}`,
  });

  /** n full exchanges: user 1, assistant 1, user 2, assistant 2, … */
  function conversation(exchanges: number): ChatTurn[] {
    return Array.from({ length: exchanges }, (_, i) => [
      turn("user", i + 1),
      turn("assistant", i + 1),
    ]).flat();
  }

  it("keeps a short conversation whole", () => {
    const history = conversation(2);
    expect(trimHistory(history, 12)).toEqual(history);
  });

  it("keeps the newest turns and drops the oldest", () => {
    const kept = trimHistory(conversation(10), 2);
    expect(kept).toHaveLength(4);
    expect(kept[0]).toEqual({ role: "user", content: "user 9" });
    expect(kept.at(-1)).toEqual({ role: "assistant", content: "assistant 10" });
  });

  it("never leaves an assistant turn at the front", () => {
    // THE reason this function exists. The Messages API rejects a conversation
    // starting with an assistant message, and a plain window over a history
    // with an odd number of entries lands on one about half the time — the
    // request then fails after the customer has already typed.
    const odd: ChatTurn[] = [
      turn("assistant", 0),
      turn("user", 1),
      turn("assistant", 1),
    ];
    const kept = trimHistory(odd, 1);
    expect(kept[0].role).toBe("user");
  });

  it("leaves no two turns of the same role next to each other", () => {
    // The case that actually happens: the route stores the question BEFORE the
    // model call and the answer only if there was one, so a failed or empty
    // answer orphans a user turn and every later message adds another. The
    // newest must survive — it is the question being asked now.
    const orphaned: ChatTurn[] = [
      { role: "user", content: "abandoned" },
      { role: "user", content: "current" },
    ];
    expect(trimHistory(orphaned, 5)).toEqual([{ role: "user", content: "current" }]);

    const middle: ChatTurn[] = [
      { role: "user", content: "unanswered" },
      { role: "user", content: "asked again" },
      { role: "assistant", content: "answer" },
      { role: "user", content: "follow-up" },
    ];
    const kept = trimHistory(middle, 5);
    expect(kept.map((t) => t.role)).toEqual(["user", "assistant", "user"]);
    expect(kept[0].content).toBe("asked again");
  });

  it("returns nothing rather than something invalid", () => {
    // A history of only assistant turns is not a conversation. Better empty
    // than a request the API refuses.
    expect(trimHistory([turn("assistant", 1), turn("assistant", 2)], 5)).toEqual([]);
    expect(trimHistory([], 5)).toEqual([]);
  });

  it("treats a nonsensical limit as one turn instead of throwing", () => {
    // The limit comes out of a config file a human edits.
    for (const bad of [0, -3, 1.5, Number.NaN]) {
      const kept = trimHistory(conversation(5), bad);
      expect(kept.length, String(bad)).toBeLessThanOrEqual(2);
      expect(kept[0]?.role ?? "user").toBe("user");
    }
  });
});

describe("mayUseChat", () => {
  it("says no while the feature is off, whatever the member holds", () => {
    expect(mayUseChat(false, null, true)).toBe(false);
    expect(mayUseChat(false, "pro", true)).toBe(false);
  });

  it("says yes to every signed-in member when no plan is required", () => {
    expect(mayUseChat(true, null, false)).toBe(true);
  });

  it("asks for the plan when the chat belongs to one", () => {
    expect(mayUseChat(true, "pro", true)).toBe(true);
    expect(mayUseChat(true, "pro", false)).toBe(false);
  });
});

describe("chatNavVisible", () => {
  it("shows the entry while she is usable, to anybody", () => {
    expect(chatNavVisible(true, true, true)).toBe(true);
    expect(chatNavVisible(true, true, false)).toBe(true);
  });

  it("keeps the entry for the Operator when the machine cannot run her", () => {
    // The case this function exists for: switched on in config/ai-chat.json,
    // no key for the provider her task is bound to. The page behind the entry
    // is the only thing in the app that says so.
    expect(chatNavVisible(false, true, true)).toBe(true);
  });

  it("hides it from the Member in that same case", () => {
    // The diagnosis names an environment variable. A customer is owed neither
    // the problem nor the infrastructure behind it.
    expect(chatNavVisible(false, true, false)).toBe(false);
  });

  it("hides it from everybody once the product says no", () => {
    // `"enabled": false` — a decision, not a fault. There is nothing to report.
    expect(chatNavVisible(false, false, true)).toBe(false);
    expect(chatNavVisible(false, false, false)).toBe(false);
  });
});

describe("chatLimit", () => {
  it("meters over ten minutes", () => {
    expect(chatLimit(20)).toEqual({ max: 20, windowMs: 600_000 });
  });
});

describe("ChatError", () => {
  it("carries the code as its message, for the log", () => {
    const error = new ChatError("chatRateLimited");
    expect(error.code).toBe("chatRateLimited");
    expect(error.message).toBe("chatRateLimited");
    expect(error).toBeInstanceOf(Error);
  });

  it("has no duplicate codes", () => {
    expect(new Set(CHAT_ERROR_CODES).size).toBe(CHAT_ERROR_CODES.length);
  });
});
