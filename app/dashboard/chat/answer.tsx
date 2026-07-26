// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

"use client";

// One answer, rendered.
//
// The parsing is `lib/ai/markdown.ts` — pure, unit-tested, and it hands back
// DATA. This file turns that data into React elements, which is the whole
// security story: there is no `dangerouslySetInnerHTML` here and therefore no
// sanitiser to keep current. Text a model wrote about a question a customer
// typed can only ever become a string inside an element.
//
// It runs on every streamed chunk, so it stays cheap: a few regexes over a
// couple of hundred characters, no memoisation to get stale.
import { Fragment } from "react";

import { parseAnswer, type Inline } from "@/lib/ai/markdown";

function runs(parts: Inline[]) {
  return parts.map((part, index) => {
    switch (part.kind) {
      case "strong":
        return (
          <strong key={index} className="font-semibold">
            {part.text}
          </strong>
        );
      case "em":
        return <em key={index}>{part.text}</em>;
      case "code":
        return (
          <code
            key={index}
            className="bg-background/70 rounded px-1 py-0.5 font-mono text-[0.9em]"
          >
            {part.text}
          </code>
        );
      default:
        return <Fragment key={index}>{part.text}</Fragment>;
    }
  });
}

export function AnswerText({ text }: { text: string }) {
  const blocks = parseAnswer(text);

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        if (block.kind === "list") {
          const items = block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{runs(item)}</li>
          ));
          return block.ordered ? (
            <ol key={index} className="list-decimal space-y-1 pl-5" start={block.start}>
              {items}
            </ol>
          ) : (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {items}
            </ul>
          );
        }
        return (
          <p key={index}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                {runs(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
