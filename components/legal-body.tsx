// The blocks from `lib/legal/markdown.ts` as React elements.
//
// A server component, because there is nothing interactive here — and no
// `dangerouslySetInnerHTML`, which is the whole security story: the parser
// hands back data, and text can only ever become a string inside an element.
// There is no sanitiser here to keep current, because there is no HTML.
import type { Block, Inline } from "@/lib/legal/markdown";

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
      case "link":
        return (
          <a
            key={index}
            href={part.href}
            className="text-primary underline underline-offset-4"
            // Only for links that leave the app. `rel` matters on those and is
            // noise on an internal one, and `/impressum` linking to
            // `/datenschutz` should stay in the tab the reader is in.
            {...(part.href.startsWith("/")
              ? {}
              : { target: "_blank", rel: "noopener noreferrer" })}
          >
            {part.text}
          </a>
        );
      default:
        return <span key={index}>{part.text}</span>;
    }
  });
}

export function LegalBody({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          // h1 is the page title, rendered by PageHeader — so a `#` in the file
          // becomes an h2 and the outline stays legal rather than doubling the
          // top level. h3/h4 follow from there.
          const Tag = (["h2", "h3", "h4"] as const)[block.level - 1];
          const size = ["text-xl", "text-lg", "text-base"][block.level - 1];
          return (
            <Tag key={index} className={`${size} mt-4 font-semibold first:mt-0`}>
              {block.text}
            </Tag>
          );
        }

        if (block.kind === "list") {
          return (
            <ul key={index} className="ml-5 list-disc space-y-1 text-sm">
              {block.items.map((item, i) => (
                <li key={i}>{runs(item)}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={index} className="text-sm leading-relaxed">
            {block.lines.map((line, i) => (
              <span key={i}>
                {runs(line)}
                {i < block.lines.length - 1 ? " " : null}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
