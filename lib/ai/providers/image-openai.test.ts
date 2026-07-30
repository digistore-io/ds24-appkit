// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The OpenAI-shaped image adapter's pure halves — what goes on the wire and
// what is read back off it. No network, which is where a request builder is
// actually verifiable.
import { describe, expect, it } from "vitest";

import {
  IMAGE_PROFILES,
  buildBody,
  imageFrom,
  mimeFor,
  usageFrom,
} from "./image-openai";
import type { ImageRequest } from "./types";

const REQUEST: ImageRequest = {
  model: "gpt-image-2",
  prompt: "a quiet kitchen table at sunrise",
  n: 1,
  timeoutMs: 60_000,
};

// One transparent pixel, so the decode is checkable rather than assumed.
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("buildBody", () => {
  it("carries the model, the prompt and the count", () => {
    expect(buildBody(REQUEST)).toMatchObject({
      model: "gpt-image-2",
      prompt: "a quiet kitchen table at sunrise",
      n: 1,
    });
  });

  it("never asks for fewer than one", () => {
    expect(buildBody({ ...REQUEST, n: 0 })).toMatchObject({ n: 1 });
  });

  it("omits size when nobody named one", () => {
    // Sending `size: undefined` would be sending a field, and the sizes on
    // offer differ per model — letting the provider default is the honest
    // answer to "which sizes does this model have".
    expect(buildBody(REQUEST)).not.toHaveProperty("size");
    expect(buildBody({ ...REQUEST, size: "1024x1024" })).toMatchObject({
      size: "1024x1024",
    });
  });

  it("lets providerOptions override anything, because it is the escape hatch", () => {
    // AD-13: an Operator who wrote `quality` in their binding means it.
    const body = buildBody({
      ...REQUEST,
      providerOptions: { quality: "high", background: "transparent", n: 3 },
    });
    expect(body).toMatchObject({ quality: "high", background: "transparent", n: 3 });
  });

  it("strips the options this layer invented", () => {
    // `cacheTtl` is ours and no provider has a parameter by that name. A
    // binding moved from a text task would otherwise carry it to an API that
    // answers 400.
    expect(buildBody({ ...REQUEST, providerOptions: { cacheTtl: "1h" } })).not.toHaveProperty(
      "cacheTtl",
    );
  });
});

describe("mimeFor", () => {
  it("prefers what the entry itself says", () => {
    // OpenRouter reports it per image.
    expect(mimeFor({ media_type: "image/webp" }, "png")).toBe("image/webp");
  });

  it("falls back to the response-wide output format", () => {
    // OpenAI says it once, as a bare word rather than a media type.
    expect(mimeFor({}, "webp")).toBe("image/webp");
    expect(mimeFor({}, "jpeg")).toBe("image/jpeg");
    expect(mimeFor({}, "jpg")).toBe("image/jpeg");
  });

  it("assumes PNG when nothing says otherwise", () => {
    expect(mimeFor({}, undefined)).toBe("image/png");
  });
});

describe("imageFrom", () => {
  it("decodes the base64 into bytes", () => {
    const image = imageFrom({ b64_json: PNG_B64 }, "png");
    expect(image).not.toBeNull();
    expect([...image!.bytes.slice(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
  });

  it("carries the rewritten prompt where there is one", () => {
    // The answer to "why does this not look like what I asked for".
    const image = imageFrom({ b64_json: PNG_B64, revised_prompt: "a sunlit table" }, "png");
    expect(image!.revisedPrompt).toBe("a sunlit table");
  });

  it("treats a blank rewritten prompt as none", () => {
    expect(imageFrom({ b64_json: PNG_B64, revised_prompt: "   " }, "png")!.revisedPrompt).toBeNull();
  });

  it("skips an entry with no bytes rather than producing an empty picture", () => {
    // A URL-only answer lands here. Storing an empty image would put a broken
    // picture on somebody's page instead of failing.
    expect(imageFrom({}, "png")).toBeNull();
    expect(imageFrom({ b64_json: "" }, "png")).toBeNull();
  });
});

describe("usageFrom", () => {
  it("always reports the picture count, even when the provider itemises nothing", () => {
    // The count is a fact this app holds because it asked. Returning "we know
    // nothing" would make a priceable call look unpriceable.
    const usage = usageFrom(undefined, 2, IMAGE_PROFILES.openai);
    expect(usage.images).toBe(2);
    expect(usage.inputTokens).toBe(0);
  });

  it("reads OpenAI's token names", () => {
    const usage = usageFrom(
      { input_tokens: 50, output_tokens: 1600, total_tokens: 1650 },
      1,
      IMAGE_PROFILES.openai,
    );
    expect(usage.inputTokens).toBe(50);
    expect(usage.outputTokens).toBe(1600);
    expect(usage.reportedTotalTokens).toBe(1650);
  });

  it("reads OpenRouter's different names for the same two counts", () => {
    const usage = usageFrom(
      { prompt_tokens: 10, completion_tokens: 4175, total_tokens: 4185 },
      1,
      IMAGE_PROFILES.openrouter,
    );
    expect(usage.inputTokens).toBe(10);
    expect(usage.outputTokens).toBe(4175);
  });

  it("carries OpenRouter's reported cost, in the currency it quoted", () => {
    // Beats any price table for a router that picks its upstream at request
    // time — and it is never relabelled, because relabelling would be inventing
    // an exchange rate (AD-21).
    const usage = usageFrom({ cost: 0.04 }, 1, IMAGE_PROFILES.openrouter);
    expect(usage.reportedCostMicros).toBe(40_000);
    expect(usage.reportedCostCurrency).toBe("USD");
  });

  it("ignores a cost from a provider that does not report one", () => {
    // OpenAI has no such field; a stray one would be somebody else's number.
    const usage = usageFrom(
      { cost: 0.04 } as { cost: number },
      1,
      IMAGE_PROFILES.openai,
    );
    expect(usage.reportedCostMicros).toBeNull();
  });
});

describe("the profiles", () => {
  it("point at each vendor's own path, which is not the same path", () => {
    expect(IMAGE_PROFILES.openai.url).toBe("https://api.openai.com/v1/images/generations");
    // Not `/images/generations` — OpenRouter's endpoint is `/images`.
    expect(IMAGE_PROFILES.openrouter.url).toBe("https://openrouter.ai/api/v1/images");
  });
});
