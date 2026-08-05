<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Who authors the content — code or tables

One question comes before the first content table (`build-app` Step 2), and it
is not about the content at all: **who will edit it after launch?** Skipping it
has a known failure, seen in the field: a course whose every word the developer
writes himself — and an app that nonetheless carries course tables, an admin
CRUD and an editing surface only its own builder will ever open. Correct for a
platform; on a single-author app it is pure overhead that must be secured,
tested and translated like everything else.

The decision is general: it applies to courses, membership libraries and any
content the operator authors — everything the app *delivers* rather than
*collects*.

## The question, and the two answers

Read the vendor's own words, top to bottom — the first row that matches wins:

| The vendor says | Case |
|---|---|
| "I write and record it myself; it changes when I change it" | **1 — content in code** |
| "a colleague / an editor maintains it, without me" | **2 — content in the database** |
| "my users publish their own content" | **2 — the app is a platform** |

The tie-break: **when in doubt, case 1.** Moving up later is a migration;
moving down is deleting an admin surface nobody used. One is planned work, the
other is regret.

## Case 1 — the developer is the author: Git is the CMS

The content lives **hardcoded in the repo** — typed constants or content
files, e.g. a `content/course.ts` exporting the blocks and units with `slug`,
`title`, `position` and `body`. Not database tables, not seeded rows. An edit
is a commit; the history, review and rollback a CMS would need are what Git
already does.

What falls away, and what stays:

- **The content tables fall away.** `course_blocks`, `course_units`,
  `program_weeks` from [`docs/courses.md`](courses.md) — their shape becomes
  the *type* of the constant, so nothing about the shapes' logic changes.
- **The state tables stay — always.** CONTENT is the operator's; STATE is the
  customer's. `unit_completions` and `submissions` key on **slugs**
  (`unitSlug`, `weekSlug`), never on content-row foreign keys — precisely so
  they work unchanged whether the unit came from a table or a constant.
- **Media still go through the media store.** The store is delivery, not
  authorship: files are declared in `content/media-manifest.json` and land in
  every environment's bucket via the content commands
  ([`docs/content.md`](content.md)) — `visibility: "public"` for what anyone
  may see (covers, a free lesson), `"entitled"` + `requiresPlan` for what is
  sold. The constant carries the media **path** (`"topic/file.mp4"`), never a
  media id: an id is a row in ONE database, a path resolves to the right row
  in every environment (`media.storageKey = "content/" + path`).
- **No admin UI, no CRUD pages, no content migrations.**

And one thing case 1 is NOT: the seed. `node run.mjs db-seed`
([`docs/database.md`](database.md) → *Seed data*) creates dev fixtures;
seeding the course into tables buys the whole data model back and still leaves
"who edits row 7?" unanswered.

## Case 2 — the author is somebody else

Content in the database — exactly the schemas [`docs/courses.md`](courses.md)
ships — and an editing surface behind `requireOwner()` or a role check,
modelled on `app/dashboard/admin/users/` (list, detail, actions, toasts and
translation in one piece). Media on the same two delivery legs as above;
nothing about `lib/media` differs between the cases.

This is the right answer whenever the person editing cannot ship a commit:
another employee, an external editor, or — the platform case — the app's own
users.

One consequence follows from "content in the database", and skipping it is a
known field failure: **rows do not deploy.** Everything built and filled
locally goes live as empty tables. The editing surface writes into the LIVE
database once the app is deployed; the initial fill the agent produced
locally travels as an idempotent applier plus the media manifest —
[`docs/content.md`](content.md), and `node run.mjs content-check --env prod`
at go-live is the proof it arrived.

## The honest trade-off

Case 1 → case 2 later means building the data model *then* and moving the
constants into rows: a migration, planned work, accepted. The other direction
is worse: an admin UI for one person is code that must be gated, tested and
translated for an editor who does not exist — and it will be the least-used,
least-watched surface in the app, which is exactly where holes live.

## Record it

One line in `docs/app.md`'s product block:

```
Content authority: developer | separate-author | platform
```

— plus the reason under *Decisions worth remembering*, so no later session
re-proposes the CRUD. A recorded answer is an answer.
