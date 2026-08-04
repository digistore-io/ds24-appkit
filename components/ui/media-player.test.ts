// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The subtitle contract of the player, asserted on real render output.
//
// This repo has no DOM test environment (vitest runs with `environment:
// "node"`), but unlike `app-shell.tsx` this component needs none:
// `MediaPlayer` is a pure function component with no hooks, so
// `renderToStaticMarkup` produces its actual HTML in plain Node. That makes
// the one contract this file exists for checkable for real rather than
// structurally: tracks are PRESENT and none of them is DEFAULT — off until
// the viewer switches one on. A `default` attribute slipping in here would
// burn text over every video for every viewer and no other gate would notice.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MediaPlayer, type MediaTrack } from "./media-player";

const TRACKS: MediaTrack[] = [
  { src: "/api/media/vtt-de", srclang: "de", label: "Deutsch" },
  { src: "/api/media/vtt-en", srclang: "en", label: "English", kind: "captions" },
];

function render(props: Partial<Parameters<typeof MediaPlayer>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(MediaPlayer, {
      src: "/api/media/v1",
      kind: "video",
      mime: "video/mp4",
      label: "Lesson one",
      ...props,
    }),
  );
}

describe("MediaPlayer subtitle tracks", () => {
  it("renders each track with kind, language and label", () => {
    // React emits the attribute in its camelCase spelling; HTML parses
    // attribute names case-insensitively, so browsers read it as `srclang`.
    const html = render({ tracks: TRACKS });
    expect(html).toContain('<track kind="subtitles" src="/api/media/vtt-de" srcLang="de" label="Deutsch"');
    expect(html).toContain('<track kind="captions" src="/api/media/vtt-en" srcLang="en" label="English"');
  });

  it("marks NO track as default — present, but off until the viewer asks", () => {
    // The contract. With tracks listed and none marked default, every browser
    // offers them in the native CC menu and shows nothing unasked.
    const html = render({ tracks: TRACKS });
    expect(html).not.toContain("default");
  });

  it("renders no track element when there are none", () => {
    expect(render()).not.toContain("<track");
  });

  it("renders no tracks on an audio player", () => {
    // The prop is video-only; an <audio> element has no picture to caption
    // and the audio branch ignores it rather than emitting invalid markup.
    const html = render({ kind: "audio", tracks: TRACKS });
    expect(html).not.toContain("<track");
  });
});
