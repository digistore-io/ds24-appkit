import { describe, expect, it } from "vitest";

import { parseJson, sseData } from "./sse";

/** A stream that hands out exactly the chunks given, as bytes. */
function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array> | null): Promise<string[]> {
  const out: string[] = [];
  for await (const payload of sseData(stream)) out.push(payload);
  return out;
}

describe("sseData", () => {
  it("reads events separated by a blank line", async () => {
    expect(await collect(streamOf('data: {"a":1}\n\ndata: {"a":2}\n\n'))).toEqual([
      '{"a":1}',
      '{"a":2}',
    ]);
  });

  it("reassembles an event split across network chunks", async () => {
    // THE reason this file exists. A chunk boundary in the middle of a JSON
    // object is not rare — it is what happens as soon as an answer gets long.
    expect(await collect(streamOf('data: {"te', 'xt":"hello"}\n\n'))).toEqual([
      '{"text":"hello"}',
    ]);
  });

  it("survives a boundary inside the separator itself", async () => {
    expect(await collect(streamOf('data: {"a":1}\n', '\ndata: {"a":2}\n\n'))).toEqual([
      '{"a":1}',
      '{"a":2}',
    ]);
  });

  it("handles CRLF line endings", async () => {
    expect(await collect(streamOf('data: {"a":1}\r\n\r\n'))).toEqual(['{"a":1}']);
  });

  it("yields a final event that arrives without its trailing blank line", async () => {
    // Dropping it loses the last chunk of the answer — or the usage, which is
    // worse, because the answer is visibly short and a missing cost is not.
    expect(await collect(streamOf('data: {"a":1}\n\ndata: {"usage":true}'))).toEqual([
      '{"a":1}',
      '{"usage":true}',
    ]);
  });

  it("joins a multi-line data field with newlines", async () => {
    expect(await collect(streamOf("data: line one\ndata: line two\n\n"))).toEqual([
      "line one\nline two",
    ]);
  });

  it("ignores comments, event names and ids", async () => {
    expect(
      await collect(streamOf(": keep-alive\n\nevent: message\nid: 7\ndata: x\n\n")),
    ).toEqual(["x"]);
  });

  it("strips exactly one space after the colon", async () => {
    expect(await collect(streamOf("data:  padded\n\n"))).toEqual([" padded"]);
  });

  it("passes [DONE] through rather than swallowing it", async () => {
    // Whether it is a sentinel is the adapter's business: OpenAI's compatible
    // providers send it, Gemini does not.
    expect(await collect(streamOf("data: [DONE]\n\n"))).toEqual(["[DONE]"]);
  });

  it("yields nothing for a null body", async () => {
    expect(await collect(null)).toEqual([]);
  });

  it("yields nothing for an empty stream", async () => {
    expect(await collect(streamOf(""))).toEqual([]);
  });
});

describe("parseJson", () => {
  it("parses valid JSON", () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("returns null instead of throwing", () => {
    // A malformed chunk must skip, not kill the stream mid-answer.
    expect(parseJson("[DONE]")).toBeNull();
    expect(parseJson("")).toBeNull();
  });
});
