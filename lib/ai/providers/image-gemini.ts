// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Gemini's image generation.
//
// ── Why it is `generateContent` and not a separate endpoint ────────────────
// Google's image models answer on the SAME endpoint as the text ones, and the
// difference is one field: `responseModalities` has to name `IMAGE`, or the
// model politely writes a paragraph describing the picture it would have drawn.
// That is the failure worth knowing about here — a 200, a plausible answer, and
// no picture anywhere in it.
//
// The picture comes back as an inline base64 part beside any text the model
// added, which is why the parts are walked rather than indexed.
//
// ── Which of Google's three surfaces this uses, and why ────────────────────
// There are now three ways to ask Google for a picture: the newer Interactions
// API, this one (`generateContent`, which their docs now label "Legacy" while
// continuing to document and serve it), and the Imagen `:predict` endpoint,
// which is deprecated with a shutdown date. This adapter uses `generateContent`
// on purpose: it is the surface whose response shape is fully documented — the
// Interactions API's usage reporting is not — and it is the same endpoint
// `gemini.ts` already talks to, so one hostname and one auth header serve both.
// Moving to Interactions is a self-contained change to this file when its
// accounting is documented.
//
// The credential travels in `x-goog-api-key`, never in the query string — the
// `?key=` form works and puts a credential into every access log, proxy log and
// browser history it passes through. Same rule as `gemini.ts`.
import { GEMINI_BASE_URL } from "./gemini";
import {
  DEFAULT_TIMEOUT_MS,
  ProviderError,
  codeForStatus,
  emptyUsage,
  passthroughOptions,
  type GeneratedImage,
  type ImageAdapter,
  type ImageRequest,
  type ImageResult,
  type Usage,
} from "./types";

interface InlinePart {
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
  text?: string;
}

interface GeminiImageResponse {
  candidates?: Array<{ content?: { parts?: InlinePart[] } }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

/** `…/models/{model}:generateContent`. The model may arrive with or without the prefix. */
export function imageEndpointFor(model: string): string {
  const path = model.startsWith("models/") ? model : `models/${model}`;
  return `${GEMINI_BASE_URL}/${path}:generateContent`;
}

export function buildBody(req: ImageRequest): Record<string, unknown> {
  const options = passthroughOptions(req.providerOptions);
  const configured = (options.generationConfig ?? {}) as Record<string, unknown>;

  return {
    contents: [{ role: "user", parts: [{ text: req.prompt }] }],
    generationConfig: {
      // ⚠️ LOAD-BEARING, and the exact value matters. Without it the model
      // answers with a description of the picture instead of the picture — a
      // 200 carrying prose, which reads as a working call right up until
      // somebody looks for the image. `["TEXT", "IMAGE"]` is what Google's own
      // examples use; the model may add a sentence beside the picture and
      // `imagesFrom` simply ignores the text parts.
      responseModalities: ["TEXT", "IMAGE"],
      // An Operator's own generationConfig wins outright: it is spread after
      // the modality, so naming `responseModalities` themselves replaces ours.
      // That is the escape hatch working as documented (AD-13) — and it is the
      // one way to get a text-and-image answer if somebody wants one.
      ...configured,
    },
    // Anything else they set travels untouched — except the two keys that ARE
    // the request. A `providerOptions.contents` would silently replace the
    // prompt with whatever was in the binding, which is not an escape hatch,
    // it is a way to send a call nobody wrote.
    ...Object.fromEntries(
      Object.entries(options).filter(
        ([key]) => key !== "generationConfig" && key !== "contents",
      ),
    ),
  };
}

/** Every inline image among the parts, in the order the model returned them. */
export function imagesFrom(json: GeminiImageResponse): GeneratedImage[] {
  const images: GeneratedImage[] = [];

  for (const candidate of json.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      // Both spellings are accepted: the REST API answers in camelCase and
      // several of Google's own examples show the snake_case form. Reading only
      // one of them produces "no image" against a response that has one.
      const inline = part.inlineData ?? part.inline_data;
      const data = inline?.data;
      if (typeof data !== "string" || data === "") continue;

      // `Buffer.from(…, "base64")` never throws: it skips what it cannot read
      // and returns however many bytes it managed, which for a malformed part
      // is none at all. A zero-byte picture would be written to the bucket and
      // given a `media` row claiming it is an image, so it is dropped here —
      // the same guard `image-openai.ts` carries, and the same reasoning.
      const bytes = new Uint8Array(Buffer.from(data, "base64"));
      if (bytes.length === 0) continue;

      images.push({
        bytes,
        // From the answer, never guessed from the model name.
        mime:
          (inline as { mimeType?: string })?.mimeType ??
          (inline as { mime_type?: string })?.mime_type ??
          "image/png",
        width: null,
        height: null,
        // Gemini does not rewrite the prompt, so there is nothing to carry back.
        revisedPrompt: null,
      });
    }
  }

  return images;
}

/**
 * How many pictures the PROVIDER said it produced — including any this app
 * could not decode.
 *
 * The distinction is the invoice. `imagesFrom()` drops parts that decode to
 * nothing, and billing from its length would quietly under-count exactly the
 * responses where something went wrong: four inline parts, one of them
 * corrupt, is still four pictures Google charged for. The comment beside
 * `billed` used to claim this while the code counted the filtered list.
 */
export function returnedImageCount(json: GeminiImageResponse): number {
  let count = 0;
  for (const candidate of json.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const data = (part.inlineData ?? part.inline_data)?.data;
      if (typeof data === "string" && data !== "") count += 1;
    }
  }
  return count;
}

/**
 * The usage. See `image-openai.ts` — the picture count is a fact this app holds
 * whether or not the provider itemised anything, so a usage row is always
 * produced rather than `null`.
 */
export function usageFrom(
  raw: GeminiImageResponse["usageMetadata"],
  images: number,
): Usage {
  const usage = emptyUsage();
  usage.images = images;
  if (!raw) return usage;

  usage.inputTokens = Number(raw.promptTokenCount ?? 0);
  usage.outputTokens = Number(raw.candidatesTokenCount ?? 0);
  usage.reportedTotalTokens =
    typeof raw.totalTokenCount === "number" ? raw.totalTokenCount : null;
  return usage;
}

export const geminiImageAdapter: ImageAdapter = {
  id: "gemini",

  async createImage(req: ImageRequest, key: string): Promise<ImageResult> {
    // Gemini draws one picture per call. Asking for four means four calls, and
    // doing that here rather than pretending `n` is supported keeps the count
    // honest on the usage row and the bill.
    const wanted = Math.max(1, req.n);
    const images: GeneratedImage[] = [];
    let billed = 0;
    let usage: Usage = emptyUsage();

    // Every throw below this line carries what the earlier rounds already
    // consumed. A request for four that fails on the third has two pictures on
    // Google's invoice; `run.ts` writes them to `ai_usage` so they appear on
    // the cost page instead of nowhere. See `ProviderError.usage`.
    const spentSoFar = (): Usage => ({ ...usage, images: billed });

    for (let i = 0; i < wanted; i += 1) {
      let response: Response;
      try {
        response = await fetch(imageEndpointFor(req.model), {
          method: "POST",
          headers: {
            "x-goog-api-key": key,
            "content-type": "application/json",
          },
          body: JSON.stringify(buildBody(req)),
          signal: AbortSignal.timeout(req.timeoutMs || DEFAULT_TIMEOUT_MS),
        });
      } catch (error) {
        throw new ProviderError(
          "providerUnreachable",
          `gemini: ${(error as Error)?.message ?? "no response"}`,
          "gemini",
          spentSoFar(),
        );
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new ProviderError(
          codeForStatus(response.status),
          `gemini answered ${response.status}: ${detail.slice(0, 500)}`,
          "gemini",
          spentSoFar(),
        );
      }

      const json = (await response.json().catch(() => ({}))) as GeminiImageResponse;
      const batch = imagesFrom(json);
      const returned = returnedImageCount(json);

      if (batch.length === 0) {
        throw new ProviderError(
          "providerFailed",
          "gemini returned no image data — check that the bound model can draw " +
            "and that responseModalities was not overridden in providerOptions",
          "gemini",
          spentSoFar(),
        );
      }

      images.push(...batch);
      // Counted from what the PROVIDER returned, not from what decoded — see
      // `returnedImageCount()`. `batch.length` cannot be zero here (the throw
      // above), so the floor of 1 only ever applies where the count and the
      // decode disagree, which is the case worth over-stating rather than
      // under-stating.
      billed += Math.max(returned, batch.length);

      // Token counts add up across the calls; the picture count is set once at
      // the end from what actually arrived.
      const round = usageFrom(json.usageMetadata, 0);
      usage = {
        ...usage,
        inputTokens: usage.inputTokens + round.inputTokens,
        outputTokens: usage.outputTokens + round.outputTokens,
        reportedTotalTokens:
          round.reportedTotalTokens === null
            ? usage.reportedTotalTokens
            : (usage.reportedTotalTokens ?? 0) + round.reportedTotalTokens,
      };
    }

    usage.images = billed;
    return { images, usage };
  },
};
