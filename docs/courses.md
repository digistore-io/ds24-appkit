<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Courses — the three shapes, and how to build each one

The online course is the commonest thing sold through Digistore24, and "build
me my course" names three different applications. The difference is not in the
tables — all three store units and results. It is in **two decisions**: *when
does a unit become visible*, and *who answers what the learner produced*. Both
are columns before they are screens, so settle them **before the data model**
(`build-app` Step 2), not after the pages.

This file is a specification to build from, not code to copy. Every schema
block below is written to be pasted into a `db/schema-*.ts` file — **and
re-exported from `db/schema.ts`**, because `drizzle-kit` reads only that
barrel: skip the `export * from "./schema-courses";` line and
`node run.mjs db-generate` produces an *empty* migration and the first page
dies on a missing table. Then the nine steps of `CLAUDE.md` → *Adding a
feature* apply to every page here — the `NAVIGATION` entry, the texts in
both `messages/*.json`, vitest for the rules. Every pointer names real,
shipped, tested code in this template to use as the model. What already has its own reference
is pointed at, not restated: files behind a purchase are
[`docs/visuals.md`](visuals.md), access is [`docs/entitlements.md`](entitlements.md),
scheduled work is [`docs/cron.md`](cron.md), migrations are
[`docs/database.md`](database.md).

## Which shape is this vendor's course?

Read the vendor's own words, top to bottom — the first row that matches wins:

| The vendor says | Shape | What decides it |
|---|---|---|
| "they buy it and work through it at their own pace" | **1 — Self-study course** | everything open at once; the order is shown, never enforced |
| "they must not get it all at once" | **2 — Week-by-week programme** | unlocking relative to the purchase date |
| "they hand something in and I read it" | **3 — Accompanied workshop** | a submission per learner, and a person at the other end |
| "it never ends" | **none of these** | see *When none of these fit*, at the end |

One tie-break, and it overrides the top-to-bottom order: **if they also hand
something in that a person reads, it is shape 3 — regardless of pacing.**
Shape 3 contains shape 2's unlocking, so "week by week AND they submit" is a
workshop, and reading it as shape 2 silently discards the half the vendor
cares most about.

The shapes share their foundations, so the shared parts are written once:
shape 3 unlocks exactly like shape 2 and says so, and every shape gates with
the same one call. A vendor reads one section; so should the agent building
for them.

**And before interviewing the vendor about content: does this app have a
knowledge corpus?** If `content/knowledge-sources/` exists, the vendor has
already told it most of what the interview would ask — plan the course from
it (see *Planning from a corpus*, at the end of this file).

---

## Shape 1 — the self-study course

**What for.** A finished course — videos in blocks that build on each other,
worksheets to download — bought once and worked through at the learner's own
pace. The vendor's requirements, in their terms: *the order must be
recognisable* (guide, do not force), *you should see where you stopped*, *the
worksheets are part of it, not a second mail*, and access that does not run
out.

**The schema.** Two tables the agent creates per app (model for the file:
`db/schema-digistore.ts`; path: `docs/database.md`):

```ts
export const courseBlocks = pgTable("course_blocks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").notNull().unique(),        // "geburtsbeginn" — see Subjects below
  title: text("title").notNull(),
  position: integer("position").notNull(),      // the visible order
});

export const courseUnits = pgTable(
  "course_units",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    blockId: text("block_id").notNull()
      .references(() => courseBlocks.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),      // "wehen-atmung" — the unit's subject
    title: text("title").notNull(),
    position: integer("position").notNull(),
    // The video and the worksheet are media rows (docs/visuals.md). The
    // worksheet is visibility "entitled" + requiresPlan — the same check as
    // the course itself, so buying the course IS buying the files. Both
    // nullable: a unit may be text-only (put its text in `body`), and the
    // FK's `set null` keeps a deleted media row from leaving a dangling id.
    videoMediaId: text("video_media_id")
      .references(() => media.id, { onDelete: "set null" }),
    worksheetMediaId: text("worksheet_media_id")
      .references(() => media.id, { onDelete: "set null" }),
    // A unit without a video still needs somewhere for its content.
    body: text("body"),
  },
  (t) => [index("course_units_block").on(t.blockId, t.position)],
);

// "You should see where you stopped" needs a source — this is it. One row
// per unit a member finished; progress is COUNT over it against the unit
// total, derived at read time, never stored as a number.
export const unitCompletions = pgTable(
  "unit_completions",
  {
    memberId: text("member_id").notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    unitSlug: text("unit_slug").notNull(),
    completedAt: timestamp("completed_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.unitSlug] })],
);
```

**The pages.** Two, under `/dashboard` — which `authorized()` in
`auth.config.ts` already protects (the layout adds `requireActiveUser()`).
A course area OUTSIDE `/dashboard` needs the three edits `CLAUDE.md` →
*Rules* names — do not build one without reading that first.

- `/dashboard/course` — the blocks in order, each with its units and the
  learner's progress, derived from `unit_completions` at read time. The model
  is the onboarding pair — pure rules in `lib/onboarding/rules.ts`
  (`progress()`, `nextStep()`), rendering with `role="progressbar"` in
  `components/onboarding-checklist.tsx`. **Copy the shape, not the
  component**: the shipped checklist is wired to onboarding copy and hides
  itself once everything is done — right for onboarding, wrong for a course
  overview.
- `/dashboard/course/[unit]` — the video (`components/ui/media-player.tsx`),
  the worksheet (`components/ui/media-download.tsx`), and what comes next.
  Dynamic pages are skipped by `node run.mjs smoke` — open one by hand with a
  real slug before calling it done.

**The access rule** — one gate for the whole course, quoted into
`docs/app.md` as code, never as prose:

```ts
if (!(await hasPlan(memberId, "kurs_komplett"))) redirect("/plans");
```

No per-unit gate. This shape's defining property is that nothing stands
between the units.

**Ordering and unlocking.** **None — deliberately.** The order is the
`position` column and a visible sequence; the vendor wants to guide, not to
force. If the vendor says "they must not get it all at once", you are in
shape 2 — do not bolt a lock onto this one.

**The product.** One registry entry, `kind: "one_time"`
(`config/digistore-products.json`, skill `setup-digistore`). Access from a
one-off purchase has no `last_paid_day` event, so it does not expire on its
own — the grant simply has no end date. (A refund still ends it; do not write
"lifetime" into the sales copy, write what is true: pay once, no
subscription.)

**Blueprint pointers.**

| Model | For |
|---|---|
| `db/schema-digistore.ts` | the shape of a schema file |
| `components/onboarding-checklist.tsx` | progress that is derived, not stored |
| `docs/visuals.md` → *Selling a file* | the worksheets behind the purchase |
| `docs/entitlements.md` | what `hasPlan()` answers, and what it does not |

**Interactive elements.** *Needs template 0.9.0 or newer — `node run.mjs
update` brings the text, not the code.* A game or a self-check per block —
recipes A and B in [`docs/learning.md`](learning.md), which also maps every
element back to its shape. The element's `subject` is the **unit's slug**
(`"wehen-atmung"`), the same string a `<CompanionPanel subject=…>` on that
unit would use.

**What this shape cannot do.** Video files above the per-kind ceiling in
`config/media.json` — the browser-to-bucket path is deliberately not built,
and `docs/visuals.md` says what it would involve. A certificate with
evidentiary weight — a look back over the course is fine, a document that
claims to prove competence is a promise the vendor has to keep.

---

## Shape 2 — the week-by-week programme

**What for.** A programme where the point *is* the pacing: the learner gets
week 1 now and week 9 in nine weeks, because getting it all at once defeats
the product. The vendor's requirements: *week by week, not negotiable*, *see
which week you are in and what comes next — but not what is in week ten*, and
*a late joiner starts at week one*.

**The schema.** One table; the learner's start date is **not** in it:

```ts
export const programWeeks = pgTable("program_weeks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").notNull().unique(),        // "woche-7"
  title: text("title").notNull(),
  position: integer("position").notNull(),
  // Days after PURCHASE until this week opens: 0, 7, 14, …
  releaseAfterDays: integer("release_after_days").notNull(),
  videoMediaId: text("video_media_id"),
});
```

The start date is the learner's grant — never a second table that could
disagree with it. **The entitlement layer does not expose that date yet, so
widening it is step one of this shape** (it is your app's code): add the
grant's `createdAt` to `ENTITLEMENT_COLUMNS` and a `grantedAt: Date` field to
`Entitlement` in `lib/entitlements/manage.ts` — the interface's own comment
marks additions as safe — and extend the column list its leak-guard test
pins. Do **not** reach for `listGrantsFor()` instead: that is the Operator's
read, it carries the operator's `note`, and the same file forbids it on
member surfaces.

**Which grant, when there are two:** the earliest `grantedAt` among the
grants `entitlementsFor()` returns — that is, among the *currently active*
ones. A re-buy after a refund therefore restarts the clock, deliberately; and
for a purchase made without signing in and claimed at first sign-in, the
clock starts at the claim, not at the payment — say both to the vendor once,
in `docs/app.md`. A late joiner starts at week one *by construction*, because
their grant is younger.

**The unlocking rule — this IS the shape.** A week is visible when

```
now >= grantedAt + releaseAfterDays
```

computed **on every read**, relative to the **purchase**, never to the
calendar. That is the same mechanism `grants.accessUntil` already uses — a
comparison against the clock at read time — and it means **unlocking needs no
cron job at all**. A scheduled job (`lib/cron/jobs.ts`, `docs/cron.md`) enters
only if the vendor wants a *message* sent when a week opens; getting this
wrong is how a simple product acquires a scheduler.

**Write the failure down before building:** a programme that renders week ten
early has failed at the thing it was bought for. The locked weeks show their
titles and their opening dates — never their content. Check it the way a
buyer would: sign in as a fresh member and try to reach week ten.

**The pages.** `/dashboard/programme` (every week: open, current, or locked
with its opening date) and `/dashboard/programme/[week]` (the open week's
content; a locked slug redirects to the overview — it does not 404, and it
does not render).

**The access rule.** The same single gate as shape 1, plus the week rule
above. Both quoted into `docs/app.md`. One case the plain gate gets wrong for
a subscription product: a **suspended** grant (a missed payment) makes
`hasPlan()` answer false, and the bare redirect sends a paying customer to
the purchase page. Ask `suspendedKeysFor()` first and say "your access is
paused" — `CLAUDE.md` → *Access* is emphatic about this. And when the
payment resumes, the clock never stopped: the missed weeks are simply open.
That is the honest default — name it to the vendor rather than letting them
discover it.

**The product.** `kind: "one_time"` is this shape's default too — a
programme ends, and a one-off price matches a product with an end. A
subscription only if the vendor insists, and then say what it means: a
cancellation's `last_paid_day` ends access mid-programme, locked weeks and
all.

**Blueprint pointers.**

| Model | For |
|---|---|
| `lib/cron/jobs.ts` | IF a weekly message is wanted — its header carries the four rules for a job |
| `docs/entitlements.md` | reading the grant the start date comes from |
| `CLAUDE.md` → *Access* | the compare-on-read pattern this rule copies |

**Interactive elements.** *Needs template 0.9.0 or newer.* A self-check
closing each week — recipe B in [`docs/learning.md`](learning.md); `subject`
= the week's slug (`"woche-7"`).

**What this shape cannot do.** Moving one learner's start date without an
operator action — there is nothing to edit but the grant. A fixed calendar
cohort ("we all start on March 1st") — that is a different product with
different tables, not a variant of this one. And a manual grant whose
`accessUntil` ends before the programme does: cap the opening dates the
overview shows at the grant's own end, or the page promises "week 10 opens
on 3 October" to somebody whose access ends in August.

---

## Shape 3 — the accompanied workshop

**What for.** A programme where the product is that **a person reads what the
participants hand in**. Weekly impulse, weekly task, a submission — and the
vendor reads it. Some vendors are explicit that no machine may touch their
participants' texts; that is a product requirement, not a budget constraint,
and this shape honours it by construction.

**The schema.** Weeks exactly as in shape 2, plus the submissions:

```ts
export const submissions = pgTable(
  "submissions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    // The participant. Every read of this table is scoped by memberId —
    // this is where an IDOR would live, and a submission is somebody's
    // unpublished writing.
    memberId: text("member_id").notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekSlug: text("week_slug").notNull(),
    text: text("text").notNull(),
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),
    // The vendor's reply, written by a person on the operator surface.
    reply: text("reply"),
    repliedAt: timestamp("replied_at"),
  },
  (t) => [
    uniqueIndex("submissions_member_week").on(t.memberId, t.weekSlug),
    index("submissions_member").on(t.memberId),
  ],
);
```

`cascade`, like `chat_messages`: this is the participant's own writing, and
it leaves with their account. **The unique index makes the submit an
upsert**, not an insert: resubmitting before the reply replaces the text and
updates `submittedAt`; once `repliedAt` is set, refuse with a sentence — the
reply answers a specific text, and silently swapping that text out from
under it breaks the one promise this shape makes.

It is personal data, and naming it in `docs/data-protection.md` is the
smaller half: **wire it into BOTH subject-access exports the day the table
exists** — `lib/privacy/export.ts` (the member's own download) and the
`data-export` command. Their parity test only fails when ONE of them grows a
table the other lacks; both missing `submissions` stays green, and an app
answers an Art. 15 request without the most personal content it holds.

**The submission is not an "interactive element", and keeping the two apart
is deliberate.** `activity_results.state` is a machine-written resume point;
this table holds **prose a person reads**. Nobody grades it, nothing is
metered, and the reply is typed by the vendor — all three are the product.
Do not "unify" them.

**The access rule.** The same gate and week rule as shape 2, in both
places: **the page, and the submit action** — a Server Action is an HTTP
endpoint of its own (`CLAUDE.md` → *Rules*). Before the upsert, the action
repeats `requireActiveUser()`, `hasPlan()`, the week-open rule, and checks
that `weekSlug` names an existing week — a client that POSTs `"woche-10"`
early, or after a refund, or with an invented slug, must be refused by the
action itself, not merely un-linked from the page.

**The pages.** The participant's week page carries the task, the submission
form, and — load-bearing — the **arrived** state: a participant who handed in
their first text ever must see that it reached a person
(`<Callout variant="success">`, and the reply rendered when it comes). The
vendor's reading surface is one page listing what came in, with the reply
form — **the model is `app/dashboard/admin/users/`**: list, detail, actions,
toasts and translation in one piece, `requireOwner()` first line.

**The responding path is a person, first-class.** Build the human path at
full length: submissions listed, read, replied to, the reply reaching the
participant. An AI companion that drafts or answers
(`docs/ai-in-product.md` §2.1) is an *option some vendors want* — offer it
the way `build-app` Step 1c offers everything, as a menu item with its cost,
and take a "no" as recorded in `docs/app.md`. It is never the default of this
shape and never what the human path is a fallback from: for these vendors, a
text only a machine has read is a text nobody has read.

**Unlocking.** Exactly shape 2's rule — read it there. Everything about
`releaseAfterDays`, the grant as start date and the no-cron argument applies
unchanged.

**Blueprint pointers.**

| Model | For |
|---|---|
| `app/dashboard/admin/users/` | the reading surface — list + detail + actions + translation |
| `lib/digistore/ipn.test.ts`, `buyUrl.test.ts` | the shape of the tests |
| `docs/cron.md` | IF a "new submission" mail to the vendor is wanted — mind rule 1, safe to run twice |

**Interactive elements.** *Needs template 0.9.0 or newer.* At most an
optional self-check per week — recipe B in [`docs/learning.md`](learning.md),
whose recipe C draws the line this shape lives on: the check judges its own
questions, **never the submitted text**.

**What this shape cannot do.** Notify the vendor of a new submission without
mail delivery configured (`node run.mjs mail-setup`). Grade automatically —
by design, in this shape.

---

## When none of these fit

Some vendors will tell you, in so many words: *it should not look like a
course — it is not a course, it never ends, and that is exactly the value.*
Believe them. Three signals, any one of which means you are not building a
course:

- **No beginning and no end.** Nothing to work through, nothing to complete,
  no progress to show — a progress bar on a membership is a promise it will
  be over.
- **A library, not a sequence.** The member arrives with a question and needs
  to *find* the answer — search and topics, not `position` columns.
- **Cancellation must be easy and visible.** The product is a subscription
  relationship; hiding the exit destroys the trust it runs on.

That vendor gets the **Membership** archetype (`build-app` Step 1):
`hasPlan()` on a subscription product, self-service cancellation through the
`billing-modes` skill, and surfaces built around finding rather than
following. Applying a course shape to it is not a smaller mistake than
applying the membership shape to a course — it is the same mistake in the
other direction.

---

## Subjects — the one convention all shapes share

Every unit, week and block carries a **slug**: stable, `[a-z0-9-]`, chosen
once and never derived from a database id (a slug survives a re-seed; an id
does not). The slug is the `subject` everywhere the unit is referred to — the
route segment, an activity's result row, a companion's conversation. One
lesson, one string, and its coach and its game share coordinates without
either knowing the other exists.

Which is why the uniqueness the schemas enforce per table is not enough on
its own: **slugs are unique across every subject-bearing table in one app.**
`activity_results` and a companion's conversation key on the bare string, so
a `"woche-7"` that exists in two products merges two learners' states into
one. An app selling a second course prefixes per product
(`kurs-a-wehen-atmung`) — and extends shape 1's schema with a scoping column
and a second gate key, which is a deliberate step, not a copy of the first
course's tables.

---

## Planning from a corpus

An app whose vendor went through the knowledge intake already carries the
course's raw material: a corpus under `content/knowledge-sources/`, one folder
per topic, distilled notes inside ([`docs/knowledge.md`](knowledge.md)). When
it exists, plan from it instead of interviewing the vendor from zero — the
corpus is the interview, already answered. Four derivations, in order:

- **Subjects derive from topic slugs.** The corpus's topic slugs are the stem
  the subject slugs above are built from: topic `wehen-atmung` → unit slug
  `wehen-atmung`, or `kurs-a-wehen-atmung` when a second product forces the
  prefix. Never invent a second vocabulary beside the corpus's — one string
  flows from corpus through course to activities and companions, derived, not
  duplicated.
- **Structure is read from the topic folders.** Each topic folder is a module
  candidate, its notes are the lesson candidates — and the `[[wikilinks]]`
  between notes say what leans on what. Where the optional graph exists, ask
  it for teaching order: `graphify path "<basics>" "<goal>"` answers "what has
  to come before what" from the corpus's own links, which is exactly the
  `position` column's question.
- **Lesson media come from the corpus notes' `media:` references.** A note
  that carries `media: wehen-atmung/atemuebung.mp4` has already placed that
  file on one of the two delivery legs — which recording belongs to which
  lesson is recorded, not remembered, so wiring a lesson's video starts from
  that list rather than from a folder hunt. Mind the gate, though: knowledge
  media are open to **every signed-in member** by design, so a video that only
  buyers may see goes through the media store with `visibility: "entitled"`
  ([`docs/visuals.md`](visuals.md)) — the corpus note then points at the
  master file, not at the delivery.
- **A lesson companion names its subject's handbook pages.** The companion's
  instruction points at the handbook pages written for that topic — the same
  distillation the chat answers from, so the course and the chat cannot tell a
  learner two different stories.
