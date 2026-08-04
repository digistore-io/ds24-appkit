<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Content production — from course plan to finished media

A course app without its videos is a table of contents. This file is the
reference for producing the media a course (or a landing page) still lacks —
lesson videos, voiceovers, worksheets, images — and the skill that walks it is
**`content-production`** (`.claude/skills/content-production/SKILL.md`).

**The boundary, so nothing gets built twice.** Material that already exists —
recordings, ebooks, webinars — is the intake's job
([`docs/knowledge.md`](knowledge.md), skill `knowledge-intake`): it catalogues
what is there and records which recording belongs to which lesson. Planning the
course itself is [`docs/courses.md`](courses.md). Delivering a finished file to
a paying customer is [`docs/visuals.md`](visuals.md). **This file covers the one
gap between them: media that do not exist yet.** When a corpus exists, its Gap
List names exactly which media are missing — produce those, never re-produce
what a note's `media:` line already records.

And a boundary the whole template keeps: **nothing here is app code.** The app
never reads `content/production/` at runtime, and no production tool is ever
imported by a page. Production happens BESIDE the app; only the finished file
enters it, through the media store like any other file.

## The script is the standard

There is no cross-tool text format for video — OpenTimelineIO describes edits
without rendering them, and every render API speaks its own JSON. So the stable,
tool-neutral artefact is **your own script file**, and the tools are backends it
gets compiled into: a Remotion composition for an animated explainer, an avatar
API payload for a generated presenter, word-for-word teleprompter text for a
camera. Change the script, regenerate the video — the script is what lives in
git, diffs, and survives a tool switch.

One file per video, under `content/production/<subject-slug>/` — the
**subject slug** is the same string the course unit, the activity and the
companion use ([`docs/courses.md`](courses.md) → *Subjects*): one vocabulary,
derived, never duplicated. Frontmatter is flat `key: value`, like a corpus note:

```markdown
---
title: Breathing techniques — lesson video
subject: wehen-atmung
kind: explainer            # talking-head | explainer | mixed
duration-target: 4min
language: de
status: draft              # draft | approved | produced
produced-media: —          # media path once delivered, e.g. wehen-atmung/lektion.mp4
---

## Scene 1 — why breathing decides the first hour

SAY: Wenn die erste Wehe kommt, entscheidet nicht die Kraft, sondern der Atem.
     In den nächsten vier Minuten lernst du das 4-7-8-Muster …

SHOW: calm title card, then an animated counter 4 → 7 → 8 breathing rhythm.

TEXT: 4 · 7 · 8

## Scene 2 — the pattern, step by step

SAY: …
SHOW: …
TEXT: —
```

The three channels per scene are deliberate, because they go to different
places: **SAY** is spoken word, written to be recorded verbatim (the same rule
`go-to-market` gives marketing scripts); **SHOW** is the picture — a stage
direction for a camera, a scene description for an animation; **TEXT** is
on-screen text, kept short because it is read, not heard. `—` marks an empty
channel. A talking-head script may be all SAY; an explainer needs all three.

Two rules carry over from the corpus, because a script is the vendor's content
too: the words are the **vendor's own** (a script assembled from a third-party
source is the Licence Gate's problem — [`docs/knowledge.md`](knowledge.md)),
and `status` is honest — `approved` means the vendor read it, `produced` means
the file exists and `produced-media:` names it. Scripts are committed; rendered
videos are NOT — they are far too big for a repo and belong in the media store.

## The two kinds of video, and the tool decision

| The vendor wants | Kind | The engine |
|---|---|---|
| a person talking to the camera — themselves, or a generated presenter | **talking head** | a camera or an avatar service |
| concepts explained with motion — diagrams, steps, numbers, UI | **explainer** | a programmatic renderer |
| both in one video | **mixed** | produce separately, cut together |

The recommended toolset below is a default, not a rule: **the developer picks
the tools, and another choice is as valid as these.** What matters is that the
choice — including a "no tools, I record everything myself" — lands in
`docs/app.md` under the decisions, with the date. Prices and tiers below were
checked **2026-08-04** and rot like all prices; say the current figure out loud
before anything is spent, never quote this file as if it could not have aged.

### Explainer videos: Remotion (recommended)

[Remotion](https://remotion.dev) renders video from React/TypeScript — a video
is code plus props, which makes it the one path where "video as text" is
literally true: the agent writes the composition, `npx remotion render`
produces the file locally, no account and no upload anywhere. Regenerating a
corrected or translated variant is editing the script and rendering again.

- **Licence** (checked 2026-08-04): free for individuals and for-profit teams
  of **up to 3 people**, commercial output included — which covers most vendors
  on this template. From 4 people it is "Remotion for Creators", $25 per seat
  per month. **Ask the team size once**, record the answer in `docs/app.md`,
  and on 4+ say the price before the first render.
- **Alternatives:** [Revideo](https://github.com/midrender/revideo) is MIT and
  has no licence question at all, with a far smaller ecosystem. Manim suits
  genuinely mathematical content and little else. Service tools (invideo AI,
  Pictory, Fliki) turn a script into stock-footage slideshows in minutes —
  fast, generic-looking, watermarked on their free tiers.

**The scaffold** lives in `content-studio/` at the repo root — a sibling of the
app, never inside it:

- Its own `package.json`. The app's dependencies stay untouched; nothing under
  `app/`, `lib/` or `scripts/` ever imports from `content-studio/`.
- One base composition that takes a parsed script (the scenes above) as props,
  styled with the app's own tokens — read the accent from `app/globals.css` (or
  `docs/design.md`) so course videos look like the product they belong to.
- Committed like the scripts; `content-studio/node_modules` is ignored like any
  other.

### Talking-head videos: two honest paths

**Path A — the vendor's own face: a camera plus Descript.**
[Descript](https://descript.com) is a transcript-led editor: record, and edit
the video by editing its text — filler words, failed takes and silences removed
by its agent ("Underlord"), captions included. It produces nothing from
nothing; the input is always a recording, and the script's SAY lines are the
teleprompter text. Free tier (2026-08-04): 60 media minutes/month,
watermarked export; Creator around $24–35/month for 4K and the full agent. It
has grown an **API and an MCP server** (open beta) — a session may be able to
drive it directly; treat that as an option to try, not a step to promise.

**Path B — no filming: a generated presenter via HeyGen.**
[HeyGen](https://heygen.com) turns script text into an avatar video — stock
presenters or a clone of the vendor from a short self-recording — with strong
German lip-sync. Free tier (2026-08-04): 3 videos/month, max 1 minute,
watermarked — enough to judge the quality, not to ship a course. Creator
$29/month; the **API is priced separately** (roughly $0.80–1.00 per rendered
minute) and is the scriptable path: the agent builds the payload from the
script's SAY lines. Alternatives: D-ID (cheapest API entry, visibly weaker
lip-sync), Synthesia (excellent quality, API gated behind enterprise contracts
— out of reach for a solo vendor).

**Both paths are legitimate products.** A vendor whose face IS the brand
records; a vendor who will never sit in front of a camera generates. One
question settles it, and an avatar presenting as the vendor is something the
vendor decides, never a default.

### Voiceover and audio

An explainer needs a voice, and there are two: the vendor records the SAY lines
(a phone in a quiet room beats no video shipped), or a TTS service generates
them. TTS is deliberately an open tool choice — quality and pricing shift too
fast to freeze a recommendation here; research the current options with the
vendor when the need is real, and note that HeyGen and the service tools bring
their own voices anyway. The app's own AI layer (`docs/ai-providers.md`) has no
TTS task, and none should be invented for production tooling — production runs
beside the app, not through `runTask()`.

### Worksheets, images, covers

The short list, because the machinery exists:

- **Worksheets** are written as Markdown/HTML and printed to PDF — a print
  stylesheet in `content-studio/` is enough; no PDF library enters the app.
  Delivery to buyers is `docs/visuals.md` → *Selling a file*.
- **Images** — lesson covers, diagrams for scenes: the app can already generate
  pictures (`docs/ai-providers.md` → *Pictures*, billed per image), or the
  session produces SVG/PNG assets directly into `content-studio/assets/`.
  Remember: no SVG ever enters the media store (`docs/visuals.md`).

## API keys for production services

A service path (HeyGen, D-ID, a TTS) needs a key. It goes into `.env` — set
with the same care as every other secret, never into code or a script file —
plus a commented line in `.env.example` naming it as **production tooling the
app never reads** (for example `HEYGEN_API_KEY`). That comment is load-bearing:
`node run.mjs doctor` and the env guard know nothing about these keys, and the
next session should learn what they are from the file, not from guessing. Costs
sit on the vendor's account at that service — there is no meter in the app, so
say what a render costs before starting a batch, and start with ONE video, not
with all twelve.

## Into the app

A produced file follows the same road as any other media
([`docs/visuals.md`](visuals.md)); the production-specific steps are:

1. **Check the file before it moves.** Length roughly matches
   `duration-target`, and an `.mp4` has faststart — without
   `ffmpeg -movflags +faststart` the player downloads the whole video before
   the first frame (the same rule `kb-media-sync` enforces for knowledge
   media). Remotion's default output is fine; camera exports often are not.
2. **Into the media store** with `visibility: "entitled"` plus the course's
   `requiresPlan` — buying the course IS buying the videos. Mind the per-kind
   upload ceiling in `config/media.json`; a file above it needs the path
   `docs/visuals.md` describes.
3. **Wire the unit**: the media row's id into `videoMediaId` (worksheets:
   `worksheetMediaId`), then `node run.mjs smoke` and `node run.mjs errors`,
   and open one unit by hand — dynamic pages are skipped by `smoke`.
4. **Close the loop in the script**: `status: produced`,
   `produced-media: <topic>/<file>.mp4`. A script that says `produced` while
   the unit shows nothing is the drift this line exists to catch.

A **marketing** video (the `go-to-market` script) ends elsewhere — on the
sales page or a social channel, not behind `hasPlan()`. Same production road,
different destination; hosting it on the app's own pages is
`docs/visuals.md` → the media store with `visibility: "public"`, and an
embed from a video host needs the consent gate described there.

## What this cannot do

Named here so nobody discovers it at the last step:

- **No service works without its account and the network** — and free tiers
  watermark. A watermarked video is a preview, not a lesson; say so before a
  vendor ships one.
- **Quality is the vendor's judgement.** A render that plays is not a lesson
  that teaches; the vendor watches every video before `status: produced`, and
  that review is a step, not a courtesy.
- **Long recordings do not fit through the upload path** — the per-kind
  ceiling in `config/media.json` is real, and the way past it is described in
  `docs/visuals.md`, deliberately not built.
- **An avatar of a real person needs that person's yes.** Cloning the vendor
  is their own decision to make at the service, under that service's terms;
  cloning anybody else is off the table.
