// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The chat surface's contracts: guard first, asking costs write scope, the
// pipeline is the SHARED one (not a copy), and clearing stays scoped to the
// assistant's conversation.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/guard", () => ({ guardApi: vi.fn() }));
vi.mock("@/lib/ai/chat-endpoint", () => ({ runChatRequest: vi.fn() }));
vi.mock("@/lib/ai/conversation", () => ({
  listConversation: vi.fn(),
  clearConversation: vi.fn(),
}));

import { guardApi } from "@/lib/api/guard";
import { runChatRequest } from "@/lib/ai/chat-endpoint";
import { clearConversation, listConversation } from "@/lib/ai/conversation";

import * as chat from "./route";
import * as messages from "./messages/route";

const GUARDED = {
  ok: true,
  memberId: "member-1",
  keyId: "key-1",
  scope: "write",
  role: "member",
} as const;

function req(method = "GET", headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/v1/chat", { method, headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(guardApi).mockResolvedValue({ ...GUARDED });
  vi.mocked(listConversation).mockResolvedValue([]);
  vi.mocked(clearConversation).mockResolvedValue(0);
  vi.mocked(runChatRequest).mockResolvedValue(new Response("stream"));
});

it("every handler returns the guard's refusal untouched", async () => {
  const refusal = Response.json({ error: "unauthorized" }, { status: 401 });
  vi.mocked(guardApi).mockResolvedValue({ ok: false, response: refusal });
  expect(await chat.GET(req())).toBe(refusal);
  expect(await chat.DELETE(req("DELETE"))).toBe(refusal);
  expect(await messages.POST(req("POST"))).toBe(refusal);
  expect(listConversation).not.toHaveBeenCalled();
  expect(runChatRequest).not.toHaveBeenCalled();
});

it("asking and clearing demand write scope; reading does not", async () => {
  await messages.POST(req("POST"));
  expect(guardApi).toHaveBeenLastCalledWith(expect.anything(), { scope: "write" });
  await chat.DELETE(req("DELETE"));
  expect(guardApi).toHaveBeenLastCalledWith(expect.anything(), { scope: "write" });
  await chat.GET(req());
  expect(guardApi).toHaveBeenLastCalledWith(expect.anything());
});

it("POST hands the key's member to the SHARED pipeline with a negotiated locale", async () => {
  await messages.POST(req("POST", { "accept-language": "de-DE,de;q=0.9" }));
  expect(runChatRequest).toHaveBeenCalledWith({
    memberId: "member-1",
    request: expect.anything(),
    locale: "de",
  });
});

it("GET serializes the transcript with ISO dates", async () => {
  vi.mocked(listConversation).mockResolvedValue([
    {
      id: "t1",
      role: "user",
      content: "Hallo",
      createdAt: new Date("2026-08-01T10:00:00Z"),
    },
  ]);
  const response = await chat.GET(req());
  expect(await response.json()).toEqual({
    messages: [
      { id: "t1", role: "user", content: "Hallo", createdAt: "2026-08-01T10:00:00.000Z" },
    ],
  });
  expect(listConversation).toHaveBeenCalledWith("member-1");
});

it("DELETE clears the assistant's conversation only — the default scoping", async () => {
  vi.mocked(clearConversation).mockResolvedValue(3);
  const response = await chat.DELETE(req("DELETE"));
  expect(await response.json()).toEqual({ deleted: 3 });
  // No second argument: `null` (the assistant's conversation) is the default,
  // and passing anything else here would delete companion turns too.
  expect(clearConversation).toHaveBeenCalledWith("member-1");
});
