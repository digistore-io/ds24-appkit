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
      // An Operator's own generationConfig wins, because it is the escape hatch
      // (AD-13) — but the modality above is restored underneath it in the
      // spread order only if they did not name one themselves.
      ...configured,
    },
    // Anything else they set travels untouched.
    ...Object.fromEntries(
      Object.entries(options).filter(([key]) => key !== "generationConfig"),
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

      images.push({
        bytes: new Uint8Array(Buffer.from(data, "base64")),
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
    let usage: Usage = emptyUsage();

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

      const json = (await response.json().catch(() => ({}))) as GeminiImageResponse;
      const batch = imagesFrom(json);

      if (batch.length === 0) {
        throw new ProviderError(
          "providerFailed",
          "gemini returned no image data — check that the bound model can draw " +
            "and that responseModalities was not overridden in providerOptions",
          "gemini",
        );
      }

      images.push(...batch);

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

    usage.images = images.length;
    return { images, usage };
  },
};
