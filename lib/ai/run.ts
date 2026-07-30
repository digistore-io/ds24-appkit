// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The one entry point. Everything in this app that wants a model comes here.
//
//   const answer = await runTask("chat", { system, messages, memberId });
//   for await (const event of streamTask("chat", { … })) { … }
//
// A call names a TASK, never a model and never a provider. Which company
// answers is `config/ai-models.json`, resolved here; how that company is talked
// to is `lib/ai/providers/`; what it consumed is `lib/ai/usage.ts`.
//
// ── The order, and why it is that order ────────────────────────────────────
//
//   1. resolve the binding   → provider, model, limits are now KNOWN
//   2. resolve the adapter   → throws `noCredential` if the key is missing
//   3. call
//   4. record, after the response has gone out
//
// Step 1 before step 2 is what makes FR-39a true rather than aspirational: a
// call refused for a missing key is still recorded with the provider and model
// it would have used, and that name is usually the answer to "why is nothing
// working".
//
// **Nothing here reads `ai_usage`.** This template ships no spend ceiling
// (FR-45) — a ceiling protects against a runaway by taking the app's AI offline
// for real customers, and for this template's operators that is the worse
// failure. So the table is written once on the way out and never queried during
// a call. That is the whole performance story.
import { adapterFor, imageAdapterFor } from "./providers/registry";
import {
  DEFAULT_TIMEOUT_MS,
  ProviderError,
  type ChatMessage,
  type GeneratedImage,
  type PromptBlock,
  type StreamEvent,
  type Usage,
} from "./providers/types";
import { bindingFor, type TaskId } from "./tasks";
import { logLine, recordUsage, type UsageRecord } from "./usage";

export interface TaskInput {
  /**
   * The system prompt, in blocks. **Stable blocks first, marked `cacheable`.**
   * On three of five providers that ordering is what earns the cache discount —
   * see `lib/ai/providers/blocks.ts`.
   */
  system?: PromptBlock[];
  messages: ChatMessage[];
  /** Whom this is for, when there is somebody. Recorded, never sent. */
  memberId?: string | null;
  /** Overrides the binding's cap for this one call. Rarely needed. */
  maxTokens?: number;
}

export interface TaskResult {
  text: string;
  usage: Usage | null;
  provider: string;
  model: string;
  stopReason: string | null;
}

function buildRequest(task: TaskId, input: TaskInput) {
  const binding = bindingFor(task);
  return {
    binding,
    request: {
      model: binding.model,
      system: input.system ?? [],
      messages: input.messages,
      maxTokens: input.maxTokens ?? binding.maxTokens,
      timeoutMs: binding.timeoutMs || DEFAULT_TIMEOUT_MS,
      providerOptions: binding.providerOptions,
    },
  };
}

/** "ok", or the code of whatever went wrong. */
function outcomeOf(error: unknown): string {
  return error instanceof ProviderError ? error.code : "providerFailed";
}

function finish(record: UsageRecord): void {
  console.info(logLine(record));
  recordUsage(record);
}

/**
 * Runs a task and waits for the whole answer.
 *
 * Throws `ProviderError` with a typed, translatable code. The row is written
 * either way — a failed call is exactly the thing an Operator needs to see when
 * a provider is having a bad day.
 */
export async function runTask(task: TaskId, input: TaskInput): Promise<TaskResult> {
  const { binding, request } = buildRequest(task, input);
  const started = Date.now();

  const base = {
    task,
    provider: binding.provider,
    model: binding.model,
    memberId: input.memberId ?? null,
  };

  try {
    const { adapter, key } = adapterFor(binding.provider);
    const result = await adapter.complete(request, key);

    finish({
      ...base,
      usage: result.usage,
      outcome: "ok",
      latencyMs: Date.now() - started,
    });

    return {
      text: result.text,
      usage: result.usage,
      provider: binding.provider,
      model: binding.model,
      stopReason: result.stopReason,
    };
  } catch (error) {
    finish({
      ...base,
      usage: null,
      outcome: outcomeOf(error),
      latencyMs: Date.now() - started,
    });
    throw error;
  }
}

/**
 * Runs a task and yields the answer as it arrives.
 *
 * The row is written when the stream ENDS, because that is when the usage
 * arrives — every provider reports it once, at the end. A stream abandoned
 * half-way (the Member closed the tab) still records, through the `finally`:
 * the tokens were consumed and somebody was billed for them whether or not
 * anybody read the answer.
 */
export async function* streamTask(
  task: TaskId,
  input: TaskInput,
): AsyncGenerator<StreamEvent> {
  const { binding, request } = buildRequest(task, input);
  const started = Date.now();

  const base = {
    task,
    provider: binding.provider,
    model: binding.model,
    memberId: input.memberId ?? null,
  };

  let usage: Usage | null = null;
  let outcome = "ok";
  let recorded = false;

  const record = () => {
    if (recorded) return;
    recorded = true;
    finish({ ...base, usage, outcome, latencyMs: Date.now() - started });
  };

  try {
    const { adapter, key } = adapterFor(binding.provider);

    for await (const event of adapter.stream(request, key)) {
      if (event.type === "done") usage = event.usage;
      yield event;
    }
  } catch (error) {
    outcome = outcomeOf(error);
    throw error;
  } finally {
    // `finally` and not the end of the try block: a consumer that stops
    // iterating early — `break`, an abandoned request — runs this and nothing
    // else. Without it, exactly the calls somebody walked away from would be
    // the ones missing from the bill.
    record();
  }
}

// ── Pictures ────────────────────────────────────────────────────────────────

export interface ImageTaskInput {
  /** What to draw. Reaches the provider verbatim. */
  prompt: string;
  /** How many. One unless there is a reason — each one is billed. */
  n?: number;
  /** Provider-shaped, e.g. `"1024x1024"`. Ignored where a provider has none. */
  size?: string;
  /** Whom this is for, when there is somebody. Recorded, never sent. */
  memberId?: string | null;
}

export interface ImageTaskResult {
  images: GeneratedImage[];
  usage: Usage | null;
  provider: string;
  model: string;
}

/**
 * Runs an image task and waits for the picture.
 *
 * Same shape and same order as `runTask` — binding first, adapter second, call
 * third, record last — so a call refused for a missing key is still recorded
 * with the provider and model it would have used.
 *
 * **It returns bytes and stores nothing.** Putting a picture away is
 * `lib/media/generate.ts`, which is the only place that knows about both this
 * layer and the store. Keeping them apart is what stops the AI layer growing a
 * dependency on a bucket, and it is why `generateImage()` can charge tokens and
 * this cannot.
 *
 * A provider that cannot draw throws `unknownModel` from the registry rather
 * than being discovered here — and `node run.mjs ai-check` says so long before,
 * at the moment the binding is written.
 */
export async function runImageTask(
  task: TaskId,
  input: ImageTaskInput,
): Promise<ImageTaskResult> {
  const binding = bindingFor(task);
  const started = Date.now();

  const base = {
    task,
    provider: binding.provider,
    model: binding.model,
    memberId: input.memberId ?? null,
  };

  try {
    const { adapter, key } = imageAdapterFor(binding.provider);
    const result = await adapter.createImage(
      {
        model: binding.model,
        prompt: input.prompt,
        n: input.n ?? 1,
        size: input.size,
        timeoutMs: binding.timeoutMs || DEFAULT_TIMEOUT_MS,
        providerOptions: binding.providerOptions,
      },
      key,
    );

    finish({
      ...base,
      usage: result.usage,
      outcome: "ok",
      latencyMs: Date.now() - started,
    });

    return {
      images: result.images,
      usage: result.usage,
      provider: binding.provider,
      model: binding.model,
    };
  } catch (error) {
    finish({
      ...base,
      usage: null,
      outcome: outcomeOf(error),
      latencyMs: Date.now() - started,
    });
    throw error;
  }
}
