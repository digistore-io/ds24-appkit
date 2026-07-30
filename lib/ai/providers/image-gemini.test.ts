// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The Gemini image adapter's pure halves.
//
// The one that matters most is the first: without `responseModalities` naming
// IMAGE, the model answers with a paragraph describing the picture it would
// have drawn. A 200, a plausible body, and no image anywhere in it.
import { describe, expect, it } from "vitest";

import { buildBody, imageEndpointFor, imagesFrom, usageFrom } from "./image-gemini";
import type { ImageRequest } from "./types";

const REQUEST: ImageRequest = {
  model: "gemini-3.1-flash-image",
  prompt: "a quiet kitchen table at sunrise",
  n: 1,
  timeoutMs: 60_000,
};

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("imageEndpointFor", () => {
  it("builds the model path", () => {
    expect(imageEndpointFor("gemini-3.1-flash-image")).toMatch(
      /\/models\/gemini-3\.1-flash-image:generateContent$/,
    );
  });

  it("accepts a model that already carries the prefix", () => {
    expect(imageEndpointFor("models/x")).toMatch(/\/models\/x:generateContent$/);
    expect(imageEndpointFor("models/x")).not.toMatch(/models\/models/);
  });
});

describe("buildBody", () => {
  it("asks for an image, which is the whole difference from a text call", () => {
    const body = buildBody(REQUEST) as {
      generationConfig: { responseModalities: string[] };
    };
    expect(body.generationConfig.responseModalities).toEqual(["TEXT", "IMAGE"]);
  });

  it("puts the prompt where the model looks for it", () => {
    expect(buildBody(REQUEST)).toMatchObject({
      contents: [{ role: "user", parts: [{ text: REQUEST.prompt }] }],
    });
  });

  it("lets an Operator's generationConfig through", () => {
    const body = buildBody({
      ...REQUEST,
      providerOptions: { generationConfig: { responseFormat: { image: { imageSize: "2K" } } } },
    }) as { generationConfig: Record<string, unknown> };
    expect(body.generationConfig.responseFormat).toEqual({ image: { imageSize: "2K" } });
    // And the modality survives beside it, because that is what makes the call
    // an image call at all.
    expect(body.generationConfig.responseModalities).toEqual(["TEXT", "IMAGE"]);
  });

  it("strips the options this layer invented", () => {
    expect(buildBody({ ...REQUEST, providerOptions: { cacheTtl: "1h" } })).not.toHaveProperty(
      "cacheTtl",
    );
  });
});

describe("imagesFrom", () => {
  it("finds an inline image among the parts", () => {
    const images = imagesFrom({
      candidates: [
        {
          content: {
            parts: [
              // The model routinely adds a sentence beside the picture; the
              // parts are walked rather than indexed for exactly this reason.
              { text: "Here is your table." },
              { inlineData: { mimeType: "image/png", data: PNG_B64 } },
            ],
          },
        },
      ],
    });
    expect(images).toHaveLength(1);
    expect(images[0].mime).toBe("image/png");
    expect([...images[0].bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("reads the snake_case spelling too", () => {
    // The REST API answers camelCase and several of Google's own examples show
    // the other form. Reading only one produces "no image" against a response
    // that has one.
    const images = imagesFrom({
      candidates: [
        { content: { parts: [{ inline_data: { mime_type: "image/jpeg", data: PNG_B64 } }] } },
      ],
    });
    expect(images).toHaveLength(1);
    expect(images[0].mime).toBe("image/jpeg");
  });

  it("returns nothing for an answer that is only prose", () => {
    // The failure `responseModalities` prevents, seen from the reading end.
    expect(
      imagesFrom({ candidates: [{ content: { parts: [{ text: "I would draw…" }] } }] }),
    ).toEqual([]);
  });

  it("survives an empty or malformed answer", () => {
    expect(imagesFrom({})).toEqual([]);
    expect(imagesFrom({ candidates: [{}] })).toEqual([]);
  });

  it("reports no rewritten prompt, because Gemini does not rewrite one", () => {
    const images = imagesFrom({
      candidates: [{ content: { parts: [{ inlineData: { data: PNG_B64 } }] } }] ,
    });
    expect(images[0].revisedPrompt).toBeNull();
  });
});

describe("usageFrom", () => {
  it("always reports the picture count", () => {
    expect(usageFrom(undefined, 3).images).toBe(3);
  });

  it("reads Gemini's own field names", () => {
    const usage = usageFrom(
      { promptTokenCount: 12, candidatesTokenCount: 1120, totalTokenCount: 1132 },
      1,
    );
    expect(usage.inputTokens).toBe(12);
    expect(usage.outputTokens).toBe(1120);
    expect(usage.reportedTotalTokens).toBe(1132);
  });
});
