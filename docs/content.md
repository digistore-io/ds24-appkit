<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Content — how what this app ships reaches an environment

One sentence carries this whole page:

> **What is in the repo travels with every deploy. What is only on your
> machine — the local database, anything under `.data/` — does not exist in
> PROD until a command puts it there.**

This is the invariant behind a failure seen in the field: an agent builds a
course, the rows go into the local Postgres, the videos into the local media
store, every local gate is green — and the app goes live **empty**. Nothing
was wrong with the course. It just never left the machine, because rows and
stored files are not code: `git push` does not carry them, and no deploy hook
ever will.

Each environment (DEV / STAGING / PROD — [`environments.md`](environments.md))
has its **own database and its own media store.** So for every piece of
content this app ships, there is exactly one question: *how does it reach the
environment that is about to serve it?* This page is the answer. Who AUTHORS
the content — you in code, or somebody else through an editing surface — is
the question one page over, [`content-authority.md`](content-authority.md),
and it comes first; this page is the transport under either answer.

## What travels by itself, and what does not

| | Travels with the deploy | Stays on your machine |
|---|---|---|
| Code, pages, constants (`content/course.ts` and friends) | ✓ | |
| Migrations (`drizzle/`) — the SCHEMA | ✓ | |
| `content/` files, `config/` files, `messages/` | ✓ | |
| Small media committed under `content/media/` | ✓ (bytes only — the row still comes from `content-apply`) | |
| **Rows** in the local database (courses, catalog entries, media rows) | | ✗ |
| Files in the local media store (`.data/media/`) | | ✗ |
| Large media staged in `.data/content-media/` | | ✗ |

Three commands close the right-hand column, and `content-check` is the proof:

```bash
node run.mjs content-apply         # media rows + repo-leg bytes + appliers → one environment
node run.mjs content-media-sync    # staged bytes (.data/content-media/) → one environment's store
node run.mjs content-check         # does an environment HOLD this app's content? The gate
```

All three take `--env dev|staging|prod` (default: this machine's `APP_ENV`) —
the same axis as `ds24-sync`. **Nothing here runs by itself**: applying
content is a deliberate step, in DEV after you change content, and against
PROD as a named go-live step. What keeps that from being forgotten is
`content-check --env prod` — go-live's exit condition, and the check that
sees what `smoke` cannot: a course page over an empty table is a clean 200.

## Media: one manifest, two legs, deterministic keys

Product media — lesson videos, worksheets, covers, subtitles — are declared
in **`content/media-manifest.json`**, one entry per file:

```json
{
  "entries": [
    { "path": "geburtsbeginn/wehen-atmung.mp4",
      "visibility": "entitled",
      "requiresPlan": "kurs_komplett" },
    { "path": "geburtsbeginn/cover.png",
      "visibility": "public",
      "alt": "A calm birth room, warm light" }
  ]
}
```

- **`path`** is `<topic-slug>/<file>.<ext>` — the grammar of
  `lib/content-media/rules.mjs` (lowercase, hyphens, extension from its
  allow-map). The bucket key is always `content/<path>` — **the same file
  lands at the same key in every environment.** That determinism is the whole
  trick: it is what lets code and appliers name a file by path and be right
  in DEV and in PROD, where upload keys (`<kind>/<year>/<month>/<uuid>`)
  never can be, because a uuid row id exists once, in one database.
- **`visibility`** is `public` or `entitled` (+ `requiresPlan`, a Product Key
  from `config/digistore-products.json` — validated, because `hasPlan()`
  throws on an unknown key). `owner` does not apply: product media belong to
  the product, not to an account (`ownerId` stays null).
- **`alt`** is required for images — the same rule the upload endpoint
  enforces.

The **file** lives on one of two legs, the same split knowledge media use:

| Leg | Where | Travels how |
|---|---|---|
| shipped (≤ 10 MB) | `content/media/<path>` | with the repo; `content-apply` puts the bytes in the store |
| staged (large) | `.data/content-media/<path>` (gitignored) | `node run.mjs content-media-sync --apply` |

`content-media-sync --apply` also records each staged file's `sha256` and
`bytes` back into the manifest (commit that change): the deployed server never
sees those files, and the recorded numbers are what lets a server-side
`content-apply` still assert an honest `media` row for them.

**Referencing a file from code** works by its deterministic key, not by a row
id. In a page or an applier:

```ts
const row = await db.query.media.findFirst({
  where: eq(media.storageKey, "content/geburtsbeginn/wehen-atmung.mp4"),
});
```

then `mayAccess()` → `mediaUrlFor(row)` exactly as
[`visuals.md`](visuals.md) says. (Where `content-authority.md` case 1 says
"the constant carries the media id", read: the constant carries the media
**path**, and the page resolves it this way — an id would be a different
value in every environment.)

## Rows: appliers — this app's own tables

The template cannot know your tables (`course_blocks` is yours, built from
[`courses.md`](courses.md)), so it runs a convention instead: any module under
**`scripts/content/appliers/*.mjs`** is executed by `content-apply`, inside a
transaction, and must export two functions:

```js
// scripts/content/appliers/course.mjs
import { COURSE } from "../../../content/course-data.mjs"; // your content file

export async function apply(sql, { mediaIdFor }) {
  let count = 0;
  for (const block of COURSE.blocks) {
    await sql`
      insert into course_blocks (id, slug, title, position)
      values (${crypto.randomUUID()}, ${block.slug}, ${block.title}, ${block.position})
      on conflict (slug) do update set
        title = excluded.title, position = excluded.position`;
    count += 1;
    for (const unit of block.units) {
      const blockId = (await sql`select id from course_blocks where slug = ${block.slug}`)[0].id;
      await sql`
        insert into course_units (id, block_id, slug, title, position, video_media_id, body)
        values (${crypto.randomUUID()}, ${blockId}, ${unit.slug}, ${unit.title},
                ${unit.position}, ${unit.video ? await mediaIdFor(unit.video) : null}, ${unit.body})
        on conflict (slug) do update set
          block_id = excluded.block_id, title = excluded.title,
          position = excluded.position, video_media_id = excluded.video_media_id,
          body = excluded.body`;
      count += 1;
    }
  }
  return count;
}

// Read-only: how many of this applier's rows exist? content-check's question.
export async function present(sql) {
  return (await sql`select count(*)::int as n from course_units`)[0].n;
}
```

The rules that make this safe to run anywhere, any number of times:

- **Upsert by slug, never insert.** A slug survives a re-run and a re-seed
  ([`courses.md`](courses.md) → Subjects); `on conflict (slug) do update` is
  what makes every run *assert* the content instead of duplicating it.
- **Rows the content files define belong to the files** — every run re-writes
  them. Rows the files do not mention (a member's `unit_completions`,
  anything a customer created) are **never touched** — an applier updates
  what it names and deletes nothing.
- **`mediaIdFor("topic/file.mp4")`** resolves a manifest path to that
  environment's `media.id` — it throws by name when the row is missing, which
  is how a typo fails the run instead of wiring a null.
- **A throw rolls the applier's transaction back whole** and fails the
  command loudly. Half-applied content is worse than none.
- **`present(sql)` answers `content-check`.** Zero rows while the applier
  exists is the red line — it is what a production database looks like when
  `content-apply` never ran against it.

When is an applier the right tool? Under [`content-authority.md`](content-authority.md):
**case 1** (you author in code) usually needs none — pages read your constants
directly, only the media manifest applies. **Case 2** (content tables + an
editing surface) needs one for the *initial fill* the agent produced locally;
after go-live, the editing surface writes into the live database and the
files' ownership ends where the operator's begins.

## Against PROD — the go-live step

Rows go into whatever database `DATABASE_URL` names; bytes go into the store
`--env` resolves. Against production that is the `user-create` procedure from
[`DEPLOY.md`](DEPLOY.md) plus the `MEDIA_S3_*_PROD` reference keys from
`.env.example`:

```bash
node run.mjs content-media-sync --env prod --apply     # staged bytes → prod bucket
DATABASE_URL="postgres://…prod…" node run.mjs content-apply --env prod
DATABASE_URL="postgres://…prod…" node run.mjs content-check --env prod   # the exit condition
```

(The plain `MEDIA_S3_*` keys always mean *this machine's* environment and are
never edited to point elsewhere — the same contract as
`DIGISTORE_IPN_PASSPHRASE_PROD`.)

Two refusals are built in, and both exist because half a run is worse than
none: `--env prod` with no `MEDIA_S3_*_PROD` keys names every missing key
instead of falling back to the local store, and `--env prod` with a **local**
`DATABASE_URL` is refused outright — bytes in the prod bucket while the rows
land on your laptop is the reported bug rebuilt inside the fix.

Then open one real content page on the live app, with a real slug. A green
`content-check` proves the content is *there*; your eyes prove it *renders* —
and a 200 alone proves neither.
