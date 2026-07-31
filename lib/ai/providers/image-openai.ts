// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The OpenAI-shaped image endpoint — OpenAI itself, and OpenRouter.
//
// One implementation and a profile per company, the same arrangement
// `openai-compat.ts` has for text and for the same reason: one code path that
// two vendors exercise is one code path that stays correct.
//
// A separate file from `openai-compat.ts` rather than a branch inside it,
// because the two share nothing but a hostname. Images live at their own path,
// take a prompt rather than a message list, and have no system prompt, no cache
// ordering and no streaming worth having. Folding them together would produce a
// request builder with two disjoint halves and a comment explaining when each
// applies.
//
// ── The bytes come back base64, and that is not a preference ───────────────
// The endpoint can answer with a URL instead, and that URL expires within the
// hour. An app that stored one would be storing a link that stops working over
// lunch — and the failure looks exactly like the picture having been deleted.
// We take the bytes and put them in our own bucket. For the GPT image models
// base64 is the only option anyway; `response_format` is a no-op there.
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
  type ProviderId,
  type Usage,
} from "./types";

export interface ImageProfile {
  id: ProviderId;
  /** Full URL of the generation endpoint. The two vendors differ in the path. */
  url: string;
  /**
   * Does this provider report what the call actually cost?
   *
   * OpenRouter returns `usage.cost` in USD, which beats any price table for a
   * router that picks its upstream at request time — the same reasoning as
   * `usageAccounting` on the text profiles.
   */
  reportsCost?: boolean;
  reportedCostCurrency?: string;
}

export const IMAGE_PROFILES: Record<string, ImageProfile> = {
  openai: {
    id: "openai",
    url: "https://api.openai.com/v1/images/generations",
  },
  openrouter: {
    id: "openrouter",
    // Not `/images/generations` — OpenRouter's image endpoint is `/images`.
    // The response is OpenAI-shaped but not identical, which is what the rest
    // of this file's field handling is careful about.
    url: "https://openrouter.ai/api/v1/images",
    reportsCost: true,
    reportedCostCurrency: "USD",
  },
};

/** What the endpoint answers with. Only the fields this adapter reads. */
interface ImageApiResponse {
  data?: Array<{
    b64_json?: string;
    /**
     * The prompt the model actually drew from.
     *
     * OpenAI rewrites a prompt before drawing, so this is frequently NOT what
     * was sent — which is the answer to "why does this not look like what I
     * asked for", and why it is carried back rather than dropped.
     */
    revised_prompt?: string;
    /** OpenRouter says the media type per image; OpenAI says it once, below. */
    media_type?: string;
  }>;
  /** OpenAI: `"png"` | `"jpeg"` | `"webp"`, echoing what was produced. */
  output_format?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    /** OpenRouter's OpenAI-shaped names for the same two counts. */
    prompt_tokens?: number;
    completion_tokens?: number;
    /** OpenRouter only: what the call cost, in USD. */
    cost?: number;
  };
}

/**
 * The usage, in this layer's shape.
 *
 * A usage row is ALWAYS produced rather than `null`, unlike the text adapters.
 * The picture count is a fact this app holds because it asked for it, whatever
 * the provider itemised — recording `null` would mean "we know nothing", which
 * would be false and would make a priceable call look unpriceable.
 */
export function usageFrom(
  raw: ImageApiResponse["usage"],
  images: number,
  profile: ImageProfile,
): Usage {
  const usage = emptyUsage();
  usage.images = images;
  if (!raw) return usage;

  usage.inputTokens = Number(raw.input_tokens ?? raw.prompt_tokens ?? 0);
  usage.outputTokens = Number(raw.output_tokens ?? raw.completion_tokens ?? 0);
  usage.reportedTotalTokens =
    typeof raw.total_tokens === "number" ? raw.total_tokens : null;

  if (profile.reportsCost && typeof raw.cost === "number" && Number.isFinite(raw.cost)) {
    // Micros of the currency the PROVIDER quoted — never relabelled into
    // whatever the price file happens to use, because relabelling would be
    // inventing an exchange rate (AD-21).
    usage.reportedCostMicros = Math.round(raw.cost * 1_000_000);
    usage.reportedCostCurrency = profile.reportedCostCurrency ?? "USD";
  }

  return usage;
}

/** The media type of one returned image. Per-image where it is said, per-response otherwise. */
export function mimeFor(
  entry: { media_type?: string },
  outputFormat: string | undefined,
): string {
  if (typeof entry.media_type === "string" && entry.media_type.includes("/")) {
    return entry.media_type;
  }
  // `output_format` is a bare word (`"webp"`), not a media type. Turning it
  // into one here means an Operator who set `output_format` in their binding
  // gets a picture stored as what it actually is — and `lib/media/` sniffs the
  // bytes again anyway, so a disagreement surfaces rather than hides.
  const format = (outputFormat ?? "png").trim().toLowerCase();
  if (format === "jpeg" || format === "jpg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return "image/png";
}

export function imageFrom(
  entry: { b64_json?: string; revised_prompt?: string; media_type?: string },
  outputFormat: string | undefined,
): GeneratedImage | null {
  if (typeof entry.b64_json !== "string" || entry.b64_json === "") return null;
  const bytes = new Uint8Array(Buffer.from(entry.b64_json, "base64"));
  // A non-empty string that decodes to nothing. Storing it would put a
  // zero-byte object in the bucket and a row claiming it is a picture.
  if (bytes.length === 0) return null;
  return {
    bytes,
    mime: mimeFor(entry, outputFormat),
    // Not reported by either vendor. `lib/media/` needs neither to store nor to
    // serve, and measuring them would mean decoding the picture.
    width: null,
    height: null,
    revisedPrompt:
      typeof entry.revised_prompt === "string" && entry.revised_prompt.trim() !== ""
        ? entry.revised_prompt.trim()
        : null,
  };
}

export function buildBody(req: ImageRequest): Record<string, unknown> {
  return {
    model: req.model,
    prompt: req.prompt,
    n: Math.max(1, req.n),
    ...(req.size ? { size: req.size } : {}),
    // Spread LAST and deliberately: `providerOptions` is the escape hatch
    // (AD-13), so an Operator who set `quality`, `background` or
    // `output_format` in their binding means it and may override anything above.
    ...passthroughOptions(req.providerOptions),
  };
}

export function imageAdapter(profile: ImageProfile): ImageAdapter {
  return {
    id: profile.id,

    async createImage(req: ImageRequest, key: string): Promise<ImageResult> {
      let response: Response;
      try {
        response = await fetch(profile.url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(buildBody(req)),
          // A whole-call timeout is right here where it would be wrong for a
          // stream: this endpoint answers once, and drawing takes tens of
          // seconds rather than arriving in pieces.
          signal: AbortSignal.timeout(req.timeoutMs || DEFAULT_TIMEOUT_MS),
        });
      } catch (error) {
        throw new ProviderError(
          "providerUnreachable",
          `${profile.id}: ${(error as Error)?.message ?? "no response"}`,
          profile.id,
        );
      }

      if (!response.ok) {
        // Read for the LOG, never for the caller — a provider's error text
        // quotes the prompt back, and the prompt may be the Member's.
        const detail = await response.text().catch(() => "");
        throw new ProviderError(
          codeForStatus(response.status),
          `${profile.id} answered ${response.status}: ${detail.slice(0, 500)}`,
          profile.id,
        );
      }

      const json = (await response.json().catch(() => ({}))) as ImageApiResponse;
      const images = (json.data ?? [])
        .map((entry) => imageFrom(entry, json.output_format))
        .filter((image): image is GeneratedImage => image !== null);

      if (images.length === 0) {
        // A 200 with nothing in it. Told apart from a refusal because the two
        // send whoever reads the log to different places.
        throw new ProviderError(
          "providerFailed",
          `${profile.id} returned no image data`,
          profile.id,
        );
      }

      // The picture count is what the provider RETURNED, not what decoded — a
      // response with one unusable entry among four was still four on the
      // invoice, and under-counting there under-reports the cost.
      return {
        images,
        usage: usageFrom(json.usage, (json.data ?? []).length || images.length, profile),
      };
    },
  };
}

export const openaiImageAdapter: ImageAdapter = imageAdapter(IMAGE_PROFILES.openai);
export const openrouterImageAdapter: ImageAdapter = imageAdapter(
  IMAGE_PROFILES.openrouter,
);
