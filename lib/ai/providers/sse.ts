// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Reading a Server-Sent Events stream, with no dependency.
//
// Three of the five providers stream over SSE and all three need the same
// thing: turn a byte stream into the `data:` payloads, in order, without losing
// an event that happened to be split across two network chunks. That last part
// is the whole reason this file exists rather than a `split("\n")` at each call
// site — a chunk boundary in the middle of a JSON object is not rare, it is
// what happens as soon as an answer gets long.
//
// `fetch` is built into Node, so `response.body` is a web `ReadableStream` and
// `TextDecoder` is global. No `eventsource` package, no `undici` import.

/**
 * The `data:` payloads of an SSE stream, in order, as strings.
 *
 * Comments (`:` lines), event names and ids are ignored: no provider here uses
 * them for anything this layer needs. A multi-line `data:` field is joined with
 * newlines, per the SSE spec.
 *
 * The sentinel `[DONE]` is passed through rather than swallowed — OpenAI and
 * its compatible providers use it, Gemini does not, and the adapter is the
 * right place to know that.
 */
export async function* sseData(
  body: ReadableStream<Uint8Array> | null,
): AsyncGenerator<string> {
  if (!body) return;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Events are separated by a blank line. `\r\n` is legal too, and at
      // least one provider's proxy has been known to send it.
      let separator = findSeparator(buffer);
      while (separator) {
        const raw = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator.length);
        const payload = dataOf(raw);
        if (payload !== null) yield payload;
        separator = findSeparator(buffer);
      }
    }

    // A stream that ends without its final blank line still carries an event.
    // Dropping it loses the last chunk of the answer — or, worse, the usage.
    buffer += decoder.decode();
    const tail = dataOf(buffer);
    if (tail !== null) yield tail;
  } finally {
    // Releasing matters: an abandoned reader keeps the connection open until
    // the socket times out, and a route handler that returns early is exactly
    // when that happens.
    reader.releaseLock();
  }
}

function findSeparator(buffer: string): { index: number; length: number } | null {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");
  if (lf === -1 && crlf === -1) return null;
  if (crlf !== -1 && (lf === -1 || crlf < lf)) return { index: crlf, length: 4 };
  return { index: lf, length: 2 };
}

/** The joined `data:` value of one raw event, or null if it carries none. */
function dataOf(raw: string): string | null {
  const lines = raw.split(/\r?\n/);
  const parts: string[] = [];

  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    // One optional space after the colon, per the spec — and only one, because
    // a second one is content.
    const value = line.slice(5);
    parts.push(value.startsWith(" ") ? value.slice(1) : value);
  }

  return parts.length > 0 ? parts.join("\n") : null;
}

/** `JSON.parse` that returns null instead of throwing. */
export function parseJson(payload: string): unknown | null {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}
