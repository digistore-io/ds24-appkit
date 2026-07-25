// Gemini, natively — not through the OpenAI-compatible shim.
//
// ── Why this file exists ───────────────────────────────────────────────────
// The shim would have been free: one more profile in `openai-compat.ts`. It was
// rejected because of one number. Google BILLS thinking tokens ("response
// pricing is the sum of output tokens and thinking tokens") and they cannot be
// switched off on Gemini 2.5 Pro or the 3 series — while the OpenAI response
// shape has no field for them. A cost computed from `completion_tokens` alone
// is therefore plausibly right and systematically low, on exactly the models
// somebody picks for quality work, with nothing in the response saying so.
//
// A conservative estimate is the wrong foundation for a page an Operator prices
// their business on. So: native, where `thoughtsTokenCount` is its own number.
//
// ── Caching ────────────────────────────────────────────────────────────────
// Implicit caching is ON by default for 2.5 and newer, triggers on a shared
// prefix, discounts cached input by up to 90%, and reports the hit in
// `cachedContentTokenCount`. **Nothing is sent to enable it** — the ordering
// `flattenBlocks` preserves IS the trigger, which is why `assertCacheableOrder`
// runs before every request here.
//
// Below the model's minimum request size — 1,024 tokens on 2.5 Flash, 2,048 on
// 2.5 Pro, up to 4,096 on some models — nothing caches and nothing says so.
// That is correct behaviour, not a fault: `estimatedCacheablePrefixTokens` in
// blocks.ts exists so a check command can explain it instead of somebody
// debugging a cache that was never eligible.
//
// EXPLICIT context caching (a `CachedContent` resource with a TTL and storage
// billed per token-hour) is deliberately not used. Implicit already delivers
// the discount, so explicit would buy only a guarantee — in exchange for a
// lifecycle this layer would have to create, reuse and expire. Anyone who wants
// it can pass a `cachedContent` handle through `providerOptions`.
import {
  DEFAULT_TIMEOUT_MS,
  ProviderError,
  codeForStatus,
  emptyUsage,
  passthroughOptions,
  type Adapter,
  type NormalizedRequest,
  type Usage,
} from "./types";
import { assertCacheableOrder, flattenBlocks } from "./blocks";
import { parseJson, sseData } from "./sse";
import { IdleTimeout } from "./idle-timeout";

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
export const GEMINI_ENV_VAR = "GEMINI_API_KEY";

// ── Pure: building the request ──────────────────────────────────────────────

/**
 * The request body, in Gemini's own shape. Two differences from every other
 * provider here, and both are silent failures if missed:
 *
 *  1. **The system prompt is `systemInstruction`**, a `Content` object beside
 *     `contents` — not a turn inside it. Sent as a turn it becomes part of the
 *     conversation the model can be talked out of.
 *  2. **The assistant's role is `model`**, not `assistant`. Gemini rejects
 *     `assistant`, so a multi-turn conversation fails while a single-turn one
 *     works — which is the worst way to find out.
 */
export function buildBody(req: NormalizedRequest): Record<string, unknown> {
  assertCacheableOrder(req.system);

  // `cacheTtl` and anything else this layer invented never reaches Google —
  // implicit caching is not asked for, it is earned by the block order above.
  // A task moved here from Anthropic carries that key in its binding, and
  // sending it would fail the request over a word Google never defined.
  const options = passthroughOptions(req.providerOptions);

  const body: Record<string, unknown> = {
    contents: req.messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    })),
    generationConfig: {
      maxOutputTokens: req.maxTokens,
      ...((options.generationConfig as Record<string, unknown>) ?? {}),
    },
  };

  const system = flattenBlocks(req.system);
  if (system !== "") {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  // Everything except `generationConfig`, which was merged above rather than
  // replaced — an Operator setting `thinkingConfig` should not lose `maxOutputTokens`.
  for (const [key, value] of Object.entries(options)) {
    if (key === "generationConfig") continue;
    body[key] = value;
  }

  return body;
}

/** `…/models/{model}:generateContent` — or the SSE form. */
export function endpointFor(model: string, stream: boolean): string {
  const method = stream ? "streamGenerateContent" : "generateContent";
  // The model may arrive as `gemini-2.5-pro` or as `models/gemini-2.5-pro`.
  const path = model.startsWith("models/") ? model : `models/${model}`;
  // ⚠️ `alt=sse` is LOAD-BEARING. Without it the endpoint answers with one
  // JSON array instead of a stream — a call that looks like it worked and
  // delivers nothing incrementally.
  return `${GEMINI_BASE_URL}/${path}:${method}${stream ? "?alt=sse" : ""}`;
}

// ── Pure: reading the answer ────────────────────────────────────────────────

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * `usageMetadata` → our shape. Null when the provider said nothing.
 *
 * `candidatesTokenCount` is the visible output. `thoughtsTokenCount` is
 * reported ALONGSIDE it, not inside it — so unlike OpenAI's
 * `reasoning_tokens`, this one is added rather than merely itemised. Getting
 * that backwards under-reports every thinking call.
 *
 * ⚠️ The thinking field's exact name is the one thing here worth re-checking
 * against Google's current reference before trusting it: their thinking
 * documentation names it, the REST reference folds it into "additional
 * metadata". Both spellings seen in the wild are accepted below, and a rename
 * would show up as thinking tokens reading zero on a model that certainly
 * thought — which the reconciliation in `unexplainedTokens()` then catches,
 * because `totalTokenCount` would exceed the parts.
 */
export function usageFrom(raw: unknown): Usage | null {
  if (typeof raw !== "object" || raw === null) return null;
  const u = raw as Record<string, unknown>;

  const thinking = num(u.thoughtsTokenCount) || num(u.thoughtTokenCount);

  return {
    ...emptyUsage(),
    inputTokens: num(u.promptTokenCount),
    outputTokens: num(u.candidatesTokenCount) + thinking,
    cachedInputTokens: num(u.cachedContentTokenCount),
    thinkingTokens: thinking,
    reportedTotalTokens:
      typeof u.totalTokenCount === "number" ? u.totalTokenCount : null,
  };
}

/** All text parts of the first candidate, joined. */
export function textFrom(payload: unknown): string {
  const candidates = (payload as { candidates?: unknown })?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  const parts = (candidates[0] as { content?: { parts?: unknown } })?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => (part as { text?: unknown })?.text)
    .filter((text): text is string => typeof text === "string")
    .join("");
}

export function stopReasonFrom(payload: unknown): string | null {
  const candidates = (payload as { candidates?: unknown })?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const reason = (candidates[0] as { finishReason?: unknown })?.finishReason;
  return typeof reason === "string" ? reason : null;
}

// ── The I/O shell ───────────────────────────────────────────────────────────

async function send(
  req: NormalizedRequest,
  key: string,
  stream: boolean,
  signal?: AbortSignal,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(endpointFor(req.model, stream), {
      method: "POST",
      headers: {
        // The `?key=` query form works and puts a credential into every access
        // log, proxy log and browser history it passes through. Header only.
        "x-goog-api-key": key,
        "content-type": "application/json",
      },
      body: JSON.stringify(buildBody(req)),
      signal: signal ?? AbortSignal.timeout(req.timeoutMs || DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ProviderError(
      "providerUnreachable",
      `gemini: ${(error as Error)?.message ?? "no response"}`,
      "gemini",
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ProviderError(
      codeForStatus(response.status),
      `gemini answered ${response.status}: ${detail.slice(0, 500)}`,
      "gemini",
    );
  }

  return response;
}

export const geminiAdapter: Adapter = {
  id: "gemini",

  async complete(req, key) {
    const response = await send(req, key, false);
    const json = (await response.json()) as unknown;
    return {
      text: textFrom(json),
      usage: usageFrom((json as { usageMetadata?: unknown })?.usageMetadata),
      stopReason: stopReasonFrom(json),
    };
  },

  async *stream(req, key) {
    // An IDLE timeout, not a total one — see idle-timeout.ts. A long answer
    // must not be cut off mid-sentence just because it was long.
    const idle = new IdleTimeout(req.timeoutMs || DEFAULT_TIMEOUT_MS);

    let usage: Usage | null = null;
    let stopReason: string | null = null;

    try {
      const response = await send(req, key, true, idle.signal);

      for await (const payload of sseData(response.body)) {
        idle.touch();

        const chunk = parseJson(payload);
        if (chunk === null) continue;

        // ⚠️ Each event is a COMPLETE GenerateContentResponse, not a delta. The
        // text in it is the new text — Gemini does not resend what it already
        // sent — so this is emitted as-is. What is NOT incremental is the usage,
        // two lines down.
        const text = textFrom(chunk);
        if (text !== "") yield { type: "delta", text };

        const reason = stopReasonFrom(chunk);
        if (reason !== null) stopReason = reason;

        // ⚠️ `usageMetadata` appears in EVERY chunk and is CUMULATIVE. So the
        // last one wins and nothing is summed. Summing produces a plausible
        // number several times too large — the kind of wrong that survives
        // review because it is the right order of magnitude.
        const chunkUsage = usageFrom((chunk as { usageMetadata?: unknown })?.usageMetadata);
        if (chunkUsage) usage = chunkUsage;
      }
    } finally {
      idle.clear();
    }

    yield { type: "done", usage, stopReason };
  },
};
