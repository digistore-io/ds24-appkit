<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# The knowledge corpus — what you know, before the handbook

Most vendors do not start from nothing. There is a course already taught, an
ebook already written, two years of recorded webinars — the knowledge exists,
it is just dark: an agent cannot read a video, and nobody retypes an ebook.
This document is about the layer that fixes that, and about the media files
that travel with it.

The assistant herself — switching her on, what an answer costs, the handbook
format — is [`docs/ai-chat.md`](ai-chat.md). Read this file when the question
is *where the handbook's content comes from* and *how a video or a worksheet
gets offered in her answers*.

## The two layers, and the boundary between them

|  | The corpus | The handbook |
|---|---|---|
| Lives at | `content/knowledge-sources/` | `content/knowledge/` |
| Holds | everything you know — one distilled note per source, unbounded | what customers actually ask — curated, bounded |
| Read by | **agents, while writing** | **the model, at runtime** |

**The corpus informs writing; it never answers at runtime.** The chat keeps
reading one curated handbook, whole, as a cached prompt prefix — exactly as
[`docs/ai-chat.md`](ai-chat.md) describes, and for the reasons it gives: the
handbook is the same bytes for everyone, so it caches; a corpus is unbounded,
so it cannot.

That boundary is enforced, not hoped for: nothing under `app/`, `lib/` or
`scripts/` may reference `content/knowledge-sources/` or `graphify-out/` —
`scripts/knowledge-boundary.test.ts` fails the build on a hit and names the
file. So no later change can quietly wire the corpus into a route, a
companion or the retriever; that would be a decision, made in that test's
allowlist, with the reason written next to it.

The consequence worth internalising: **adding to the corpus changes no answer
by itself.** Answers change when a handbook page is written or refreshed from
it. Compression is the job — the corpus's breadth is input, never a target.

## The corpus — folders, notes, one format

```
content/knowledge-sources/
  wehen-atmung/                  one folder per topic, named by slug
    atemtechniken-webinar.md     one note per source
    _raw/                        verbatim material — see the Licence Gate
  geburtsbeginn/
    ebook-kapitel-3.md
```

Topic slugs are chosen once and carefully: lowercase `a–z 0–9 -`, and they
become the stem everything else is built from — the media namespace below,
and, when a course gets built, its subject slugs
([`docs/courses.md`](courses.md) → *Planning from a corpus*). One vocabulary
flowing through corpus, courses and companions — derived, never duplicated.

A corpus note carries flat `key: value` frontmatter — the same dialect as the
handbook: flat keys, comma-separated strings, no YAML lists:

```markdown
---
title: Breathing techniques webinar
topics: wehen-atmung
source-kind: video
source: webinar-2025-03-atmung.mp4
licence: own-content
status: distilled
ingested: 2026-08-03
media: wehen-atmung/atemuebung.mp4
---

The webinar establishes the 4-7-8 pattern before anything else …
Related: [[geburtsbeginn]].
```

| Key | Values |
|---|---|
| `title` | free text |
| `topics` | comma-separated topic slugs |
| `source-kind` | `video` \| `audio` \| `youtube` \| `vimeo` \| `ebook` \| `pdf` \| `web` \| `interview` |
| `source` | the URL or the original filename |
| `licence` | `own-content` \| `licensed` \| `third-party-summarised` \| `unknown` |
| `status` | `distilled` \| `needs-review` |
| `ingested` | ISO date |
| `media` | comma-separated media paths (optional) — see *Media on two legs* |

Three rules that carry the whole design:

- **`[[wikilinks]]` are written as part of distilling**, not as a separate
  pass — they are the human navigation through the corpus, and (where the
  optional graph runs) they become its edges.
- **Nothing with `status: needs-review` reaches the handbook.** A
  `needs-review` note is treated as nonexistent by handbook writing. That is
  the trust boundary that lets research be aggressive at intake time without
  laundering unverified claims into customer-facing answers: write boldly,
  review, flip the status to `distilled`.
- **No validator ships for this format** — `node run.mjs kb-check` checks the
  handbook, not the corpus. The format is a convention, and this table is its
  definition.

### The Licence Gate — asked once per source, at intake

The corpus is committed to the repo, and that is what makes the whole process
resumable and reviewable — but a repo is already **distribution** in the legal
sense the moment it is pushed to a host or shared with a collaborator. So the
rights question is settled when a source comes in, never postponed to publish
time:

- **Own content or licensed** → verbatim material (a full transcript, chapter
  text) may be stored, under the topic's `_raw/` folder.
- **Third-party** → verbatim storage is refused. The note is a distillation in
  your own words, with the source cited in frontmatter
  (`licence: third-party-summarised`).
- **The rule covers media files exactly as it covers text.** A recording you
  do not hold the rights to gets a note about what it teaches — it does not
  get copied into `content/knowledge-media/` or uploaded to your store.

The compliance check knows this question exists and will ask about
`content/knowledge-sources/`; the answer it wants to hear is that the gate was
applied at intake.

## Getting a source in — the transcript ladder

An agent reads Markdown, text and PDF directly. Everything else has a path,
ordered cheapest-first, and the ladder never dead-ends:

1. **Existing captions.** YouTube captions are fetchable for most public and
   unlisted videos, and auto-captions are good enough — the note is a
   distillation, not a transcript deliverable, so caption quality is not the
   bar it sounds like.
2. **A transcript you already have.** Webinar platforms often produce one.
   Vimeo belongs here, not on rung 1: it has no generally fetchable
   transcripts — whether one exists depends on the uploader's settings.
3. **Local Whisper transcription, via the optional graph tool below** — only
   where it was offered and accepted. It runs on your machine and costs
   wall-clock time: roughly real-time on CPU, so **a 2-hour video is a long
   lunch — say so before starting**, not after.
4. **Narration.** You talk the agent through the content ("what do minutes
   0–10 establish?") and it distills as you go. Always available, no tool at
   all — and for your *own* videos often faster and better-distilled than a
   raw transcript, because you already know what matters.

**EPUB** is ZIP + XHTML, so getting the text out is an unpack, not a tool
dependency: `unzip` or `bsdtar` where present; on modern Windows (10 and
later) `tar -xf book.epub` handles zip natively — Git Bash ships neither of
the first two reliably. Where none of that works, export once with Calibre:
`ebook-convert book.epub book.txt`.

## The optional graph — Graphify

A knowledge graph over the corpus buys three things: a coverage report (the
best source for the Gap List), structure queries, and the teaching-order
answer course planning wants. It is **optional, never required** — every step
in this document works without it, and the Gap List exists either way: with
the graph it falls out of the report (isolated nodes, thin clusters, dangling
wikilinks); without it, it is the topic map compared against the notes that
exist. A developer without Python loses convenience, not capability.

The recipe:

- **Python ≥ 3.10**, then `uv tool install graphifyy` (or pipx). The PyPI
  package is `graphifyy`, the CLI it installs is `graphify`. The package is
  deliberately named **unpinned** — a maintenance-free recipe was judged worth
  the risk that new releases arrive unreviewed.
- `graphify install --project` writes the tool's **own** project skill. This
  template ships no Graphify skill of its own — the tool maintains its own
  instructions, and a copy here would be the copy nobody updates.
- Run `/graphify` **over the corpus only** (`content/knowledge-sources/`).
  The LLM pass runs over your session's own model — no separate API key.
- The output lands in `graphify-out/` — `graph.json` (queryable),
  `GRAPH_REPORT.md` (core nodes, thin clusters, suggested questions),
  `graph.html` (interactive). **Commit it, and exclude it from your agent's
  context loading** (`.claudeignore`, or whatever ignore mechanism your agent
  program provides): a rebuilt graph must not invalidate the session's prompt
  cache.

The queries worth knowing: `graphify query "<question>"`,
`graphify path "<a>" "<b>"` — the teaching-order answer, "what has to come
before what" — and `graphify explain "<node>"`.

**Nothing in the app's runtime reads the graph.** The same structural test
that guards the corpus guards `graphify-out/` — a graph-backed retriever is a
designed future step, not something to wire in ad hoc (see *When the handbook
outgrows this*, below).

## Media on two legs — one path, two homes

A note's `media:` entry and a handbook marker both name the same thing: a
**media path**, `<topic-slug>/<file>.<extension>` — exactly two segments,
lowercase `a–z 0–9 -`, one extension dot, extension one of
`mp4 webm mp3 ogg wav jpg jpeg png webp pdf`. The grammar, the allow-map and
the constants live once, in `lib/knowledge-media/rules.mjs`, and nothing
re-implements them — the route, the chat renderer and the check scripts all
import the same answer to "is this a valid reference".

Where the bytes live is a size question, and only a size question:

| Leg | Where | Cap |
|---|---|---|
| **Shipped** | `content/knowledge-media/<path>`, committed with the app | 10 MB per file |
| **Bucket** | staged in `.data/knowledge-media/<path>` (gitignored), copied by `node run.mjs kb-media-sync` into the app's media store under `knowledge/<path>` | none |

**One namespace, deliberately.** Both legs answer at
`/api/knowledge-media/<path>`, so moving a file between them changes no
handbook text, no marker and no URL — the reference outlives the storage
decision.

Delivery is **session-gated**: a signed-in member gets the file, everybody
else gets a 404 — never a 403, because a 404 for what does not exist beside a
403 for what does would let anybody map which paths are real. Shipped files
are served full-body with `cache-control: no-store, private` and deliberately
no seeking (no `Accept-Ranges`) — anything a user seeks *in*, a long video or
recording, is over the cap anyway and belongs on the bucket leg, where a
signed URL (valid six hours) hands seeking to the store. In DEV the local
driver serves the bucket leg from disk; nothing needs to be set up.

In her answers, a handbook page offers a file with a marker:

```
[media:wehen-atmung/atemuebung.mp4|The breathing exercise (4 min)]
```

The renderer accepts **only markers that occur verbatim in the handbook** —
anything else, malformed or model-invented, degrades to plain text. So the
chat's one model-steerable link surface can only ever point where the handbook
already points; that is mechanics, not prompt discipline. The label is yours,
authored in the handbook, in your language. (The suggestion card is the
chat's; a companion renders no markers.)

Two prescriptions for the bucket leg, both learned the expensive way:

- **MP4s must be encoded with faststart** (`ffmpeg -movflags +faststart`) —
  without it the player downloads the whole file before the first frame plays,
  and `kb-media-sync` reminds you whenever an `.mp4` moves.
- **Prefer a zero-egress store.** Video delivery is the cost that grows with
  success: at 50 GB stored and 200 GB delivered a month, an R2-class bucket
  costs under a dollar where classic S3 egress pricing runs about $19. Any
  S3-compatible provider works — the app signs its own requests.

### The gate: `kb-check` proves every reference

`node run.mjs kb-check` — the same command that checks the handbook's format —
verifies every media reference before a release:

- a path that violates the naming standard is a problem in its own right;
- frontmatter `media:` and body markers are cross-checked per page — a
  declared path with no marker, or a marker missing from `media:`, is a
  problem;
- every path must **resolve**: on disk under `content/knowledge-media/`, or in
  the configured store under `knowledge/<path>`. The report names which store
  driver it verified against, and an unreachable store is a problem, never a
  skip;
- any shipped file over the 10 MB cap is flagged, with the
  `.data/knowledge-media/` move named.

A broken reference is a red gate on your machine — never a dead card in a
customer's chat.

### Filling a store: `kb-media-sync`

```bash
node run.mjs kb-media-sync                    # dry run — what would be copied
node run.mjs kb-media-sync --apply            # copy what is missing
node run.mjs kb-media-sync --env prod --apply # the PRODUCTION store
```

It walks `.data/knowledge-media/`, refuses names the grammar refuses (a bad
name must not become a bad object key), and copies **only what is missing** —
running it twice is the same as once. It is the same command for DEV and for
production: without `--env` it fills this machine's store (the plain `MEDIA_*`
variables), `--env prod` fills the production store off the `MEDIA_S3_*_PROD`
reference keys (`.env.example`) — the plain keys are never edited to point
elsewhere, the same contract as `DIGISTORE_IPN_PASSPHRASE_PROD`. Filling the
production store is a named go-live step, and `kb-check` green under the same
configuration is its exit condition.

## Keeping it alive — the maintenance loop

A corpus is a living asset, not a one-time import. The loop:

**new source → new note → refreshed Gap List → refreshed handbook pages.**

Something new gets recorded or written; it becomes a distilled note (Licence
Gate, wikilinks, `media:` where a file should be suggestible); the Gap List is
re-derived; and the handbook pages whose topics moved are rewritten — the
skill that writes them is `ai-chat-knowledge`.

And the counter-signals, because both failure modes look like diligence:

- **A ballooning handbook is failure, not progress.** The handbook must not
  grow toward the corpus — compression is the job, and `kb-check` warns as it
  approaches the budget. If every new note adds a page, the curation step has
  stopped happening.
- **A rising note count is not a health signal.** A hundred thin notes are
  worse than twenty distilled ones. The Gap List *closing* is the number that
  means something.

## When the handbook outgrows this

The handbook has a budget, and what happens when a real handbook breaks it is
[`docs/ai-chat.md`](ai-chat.md) → *When the handbook outgrows this*: the
retriever seam, the candidates — including, once a corpus with a committed
graph exists, a graph-backed retriever that reads `graphify-out/graph.json` in
plain Node. Built when the numbers say so, not before; until then the corpus
stays what it is — the thing the handbook is written from.

## The pieces

| Where | What |
|---|---|
| `content/knowledge-sources/` | the corpus — distilled notes, committed, never read at runtime |
| `content/knowledge-media/` | shipped media, ≤ 10 MB per file |
| `.data/knowledge-media/` | staging for large media (gitignored) |
| the media store, `knowledge/<path>` | large media, filled by `kb-media-sync` |
| `graphify-out/` | the optional graph — committed, excluded from agent context |
| `lib/knowledge-media/rules.mjs` | path grammar, marker grammar, allow-map, the constants — the only authority |
| `app/api/knowledge-media/[...path]/route.ts` | session-gated delivery, both legs |
| `scripts/ai/kb-check.mjs` | handbook format + every media reference, before a release |
| `scripts/knowledge/kb-media-sync.mjs` | fills a store, repeatably, dry run by default |
| `scripts/knowledge-boundary.test.ts` | the boundary — the corpus never answers at runtime |
