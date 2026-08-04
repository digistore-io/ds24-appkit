<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Troubleshooting — errors that are not what they look like

Some errors in this project arrive with a stack trace that points squarely at
innocent code. Each section here is the post-mortem of one of them: the symptom
as it actually appears, why the trace points where it does, where the cause
really lives — and, where an obvious "fix" exists that makes things worse, why
that fix is refused. Read the matching section before changing a line the
trace names; every one of these has already cost somebody the time of chasing
the wrong file.

## A hydration mismatch is not always yours

One class of hydration error comes from **outside the app entirely**, and it is
worth recognising before you go looking for the bug: a browser extension that
rewrites the page before React hydrates. React itself says so at the bottom of
its message — *"It can also happen if the client has a browser extension
installed which messes with the HTML before React loaded"* — and that line is
easy to read past when the stack trace is pointing at one of your own
components.

**Read the diff, not the trace.** React prints the attributes that differ, and
they carry the culprit's name:

```
  <svg className="lucide lucide-languages" …>
-   data-darkreader-inline-stroke=""
-   style={{--darkreader-inline-stroke:"currentColor"}}
```

`data-darkreader-*` is Dark Reader, `data-gr-*` and `data-new-gr-c-s-*` are
Grammarly. An attribute nobody in this project wrote, on an element nobody in
this project styled, is an extension. The trace names `components/…tsx` because
that is where the element was rendered, not where the attribute came from — and
the fix is never there.

Three things follow, and the third is the one that costs time:

- **Dark Reader is already dealt with.** `app/layout.tsx` carries
  `other: { "darkreader-lock": "true" }` in its `metadata`, the tag Dark Reader
  documents for exactly this
  ([`CONTRIBUTING.md`](https://github.com/darkreader/darkreader/blob/main/CONTRIBUTING.md)).
  It is right for this app rather than a workaround: the app **has** a dark mode
  of its own, so an extension inverting it on top is both the fault and a worse
  result than the toggle in the header. A browser without the extension ignores
  an unknown meta name, so it costs nothing anywhere else.
  `app/darkreader-lock.test.ts` keeps the line from being tidied away as
  mysterious.
  **The `"true"` is load-bearing and has nothing to do with Dark Reader**, which
  reads the value never (`meta[name="darkreader-lock"] != null` is its whole
  check): **Next drops an `other` entry whose value is the empty string.** Write
  the `""` that the tag's own documentation suggests and it type-checks, the
  tests stay green, and no tag ever reaches the browser. That is the shape of
  bug this whole page is about — verify a metadata change by looking at the
  delivered HTML, not at the source.
- **It is not a Windows thing**, however it was reported. It follows the browser
  profile, so the same extension shows the same error on Linux and macOS, and a
  colleague without it never reproduces the bug you are chasing.
- **`suppressHydrationWarning` is not the answer, and reaching for it is the
  mistake.** It works **one level deep** — the one on `<html>` covers the theme
  class next-themes sets there and nothing else. Adding a second one further
  down does not stop an extension rewriting the DOM; it stops React telling you
  about it, which is worse than the warning. If some future extension needs
  handling, handle it at the element it touches or not at all.

## Several copies on one machine — the sign-in that breaks for no reason

The same shape of lesson as the hydration one above: an error whose stack trace
points squarely into your code while the cause is in the browser's cookie jar.

The symptom is a sign-in that answers

```
An unexpected response was received from the server.
app/login/page.tsx (121:9) @ LoginPage
```

and a dev log showing the `GET /login` and then **no POST at all**. Both halves
matter. **Nothing is wrong with that page**, and there is nothing to fix in it.

What happened is that the `Cookie` header for `localhost` outgrew Node's 16 KB
limit, so the HTTP parser answered `431 Request Header Fields Too Large` before
Next.js ever saw the request — which is why nothing was logged. React turns any
answer that is not a valid action response into that one sentence, and blames
the component holding the `useActionState`.

It builds up because **cookies know nothing about ports**. Every copy of this
template ever started on this machine leaves a session cookie on `localhost`, so
they all travel to all of them. `lib/auth/cookie-names.ts` gives each
installation its own names — without that, apps decrypt each other's sessions
and fail with `JWTSessionError` — and around twenty installations later the
names themselves are the problem. The app that breaks first is the newest one,
which is the one that looks broken.

Two things now keep it in check, and both live in that file: the DEV cookies
expire after a week, and above 6 KB of them `proxy.ts` deletes the ones
belonging to other installations. **The threshold is what lets two apps be
worked on side by side** — do not "simplify" it away, and do not solve a future
version of this by dropping the fingerprints.

There is a third one worth knowing about: `node run.mjs errors` recognises this
message and says all of the above in four lines. And one honest limit: past
~16 KB even the GET dies, so the app never runs and cannot rescue itself — a
state a jar can reach while this app was closed. From there, and as the
immediate remedy in every case, clear the cookies for `localhost` in the
browser (DevTools → Application → Cookies).

## Dates and raw SQL

The single sharpest trap in this project, because every part of it looks right.

**Drizzle converts a column. It does not convert raw SQL.** A column reference
runs through the column's own mapper; a ``sql`…` `` expression has no mapper at
all (`noopDecoder`), so the driver's value is passed straight through and the
type parameter is only a note to the compiler. Measured against this database:

```ts
db.select({
  raw: grants.createdAt,                       // → Date                    ✅
  agg: sql<Date>`min(${grants.createdAt})`,     // → "2026-07-25 11:29:17.5" ❌ a string
})
```

Then the string reaches a table cell, `Intl` throws `Invalid time value`,
next-intl catches it and renders the raw string — **200, no test red, page
broken**. `db/sql-cast.test.ts` fails on `sql<…Date…>` so it cannot be committed;
a line that genuinely has to say it is exempted with `sql-cast-ok`.

**Do not "fix" it with `new Date(value)`.** Postgres hands over
`2026-07-25 11:29:17.552095` with no zone marker, so V8 reads it in the *host's*
zone and the timestamp silently moves by the host's offset — the very bug
`db/index.ts` exists to prevent. Instead, one of:

```ts
sql`min(${grants.createdAt})`.mapWith(grants.createdAt)   // borrow the column's mapper
sql<string>`to_char(min(${grants.createdAt}), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`
// or: select the column and do the min() in JS
```

Two more ways a `Date` stops being one, both of which keep their type:

- **Through JSON.** `Response.json({ rows })` turns every `Date` into an ISO
  string while the TypeScript type still says `Date`. Anything fetched from
  `app/api/…` needs converting back on arrival — `lib/mcp/tools.ts` calls
  `.toISOString()` on purpose, which is the honest version of the same thing.
- **A nullable column.** `format.dateTime(null)` and `format.dateTime(undefined)`
  do **not** throw and log **nothing**: they render *1 January 1970* and *today*
  respectively. No log check can catch those. Every nullable date needs its
  guard at the call site, the way the rest of the app does it:

  ```tsx
  {row.accessUntil
    ? format.dateTime(row.accessUntil, { dateStyle: "medium", timeZone: "UTC" })
    : tCommon("none")}
  ```

## What the first install prints — and which of it is real

`node run.mjs start` installs the dependencies on its first run, and npm says
three things while it does. Somebody who has just deployed cannot tell them
apart, and neither can you without this page. **Read it before you "fix"
anything npm complains about here** — one of the two obvious fixes ships a crash
to the customers of this app.

| What npm prints | What it is |
|---|---|
| `npm WARN deprecated @esbuild-kit/esm-loader` (and `core-utils`) | transitive dependencies of `drizzle-kit`, which is on its latest stable release. **Nothing to do.** Not ours, no newer stable to move to |
| `9 high severity vulnerabilities` | **real findings, none of them shipped.** All of them are in `devDependencies`, through the eslint chain. See below |
| an `ERESOLVE` block | **a regression.** There is none as of this version, and `scripts/deps.test.ts` fails if one comes back |

**The nine findings are dev-only, and that is the whole answer.**
`npm audit --omit=dev --audit-level=high` — which is what the skill
`security-gateway` §5 runs — is `found 0 vulnerabilities`. They are all one
advisory (`brace-expansion`, GHSA-mh99-v99m-4gvg) reached through
`eslint-config-next`, and they persist because the advisory range is written
`<=5.0.7` across every major, so the 1.x version that *does* carry the fix sits
inside it. This project's lockfile pins that fixed version. Nothing in the
bundle a customer loads is affected.

**Two fixes look obvious and are both refused**, with the numbers behind the
refusal in `scripts/deps.test.ts`:

- **`eslint@10`** — what `npm audit fix --force` proposes. It takes the count
  from 9 to 6, not to 0 (the findings come through eslint's *plugins*, not
  through eslint), and it introduces three fresh `ERESOLVE` conflicts. Worse on
  both counts.
- **`"overrides": { "minimatch": "^10" }`** — this one does make `npm audit`
  read clean, which is why it is the dangerous one. minimatch 10's CommonJS
  build exports an object rather than a function, and three
  `eslint-config-next` plugins call it as one, so any lint rule that matches a
  pattern dies with `TypeError: minimatch is not a function`. **`npm run lint`
  in this project stays green** — none of those rules are switched on here — so
  it looks like a clean fix and lands as a landmine in the first app that
  enables one.

So: report the nine as known and dev-only, say `npm audit --omit=dev` is clean,
and leave them. A clean audit number is not worth a crash in somebody's app. The
way out is upstream — `eslint-config-next` moving its plugins off `minimatch@3`
— and until then `node run.mjs update` will bring this page with it.

`package.json` is JSON and holds no comments, so the reasoning for every
`overrides` entry lives in **`scripts/deps.test.ts`** instead, the same way the
per-system install commands live in `scripts/dev/fixes.json`. That test also
pins the two things that must not drift back: the `esbuild` override is a
**floor** (`>=`), never a caret — written as a caret it excluded the versions
`vite` and `tsx` ask for and printed a wall of `ERESOLVE` at everybody who
deployed — and `brace-expansion` must resolve to a version that caps its
expansion.

## No greeting appeared — one script, four wirings

The greeting is not decoration: it carries the `[Setup: …]` line the project's
rulebook builds its hard precondition on — whether this machine can run the app
at all. It is printed by `scripts/dev/session-start.mjs`, and because the four
programs do not agree on how a command runs at session start, that same script
is invoked four different ways. It lives in `scripts/dev/` and not under any one
program's folder for exactly that reason — it is shared tooling, like everything
else in there:

| | |
|---|---|
| Claude Code | `.claude/settings.json` → `hooks.SessionStart` |
| Codex CLI | `.codex/config.toml` — `[[hooks.SessionStart]]` entries, enabled by `[features] codex_hooks = true` in the same file |
| Gemini CLI | `.gemini/settings.json` → `hooks.SessionStart` |
| OpenCode | `.opencode/plugins/session-start.js` — it has no declarative hooks, so this one is a module subscribing to `session.created` |

The project ships wired for all four, and `node run.mjs agent-setup` reduces it
to one. That order is deliberate: a fresh clone works in whichever program it is
opened in, before anybody has run anything — the command is the tidy-up
afterwards, never a precondition. It removes the wiring for the three programs
not in use, records what it removed in `.agent-profile.json` so `node run.mjs
update` does not put them back, and can restore any of it (`--agent <other>` or
`--undo`). It never touches `.claude/skills/`, the guidance or the greeting:
those are shared by all four. `setup-machine` runs it on the first session; the
person building never has to know it exists.

One case the script cannot cover is its own absence. It is a Node program, so a
machine without Node cannot report that it has no Node — and "the agent and git
installed, Node not yet" is the ordinary state of a fresh clone rather than an
exotic one: the agent does not need Node, git does not need Node, and the app
needs it for everything. So a second hook says it in shell instead — three words
asking whether `node` exists — which is why a machine without one greets with
`[Setup: blocked — node]` rather than with silence. That hook is the single
deliberate exception to the project's rule that tooling is written in Node, not
bash: it starts no process, finds no process, and is the one check that cannot
be written in the language it is checking for. The config files it lives in are
JSON and cannot hold a comment, which is why the reason is written down here.

Three of the four hook mechanisms are young, and two of them have open bugs
where the hook silently stops firing. That is what `node run.mjs greet` is for:
it prints the same greeting on demand. If no greeting appeared, run it —
silence is never the same as "fine".

## Chrome calls the sign-in link a "Dangerous site"

The symptom: somebody clicks the link in the sign-in mail and Chrome answers
with a full-page red interstitial — *"Dangerous site — attackers on this site
may trick you…"* — before the app is ever reached. Firefox and Safari show
their own versions of the same page.

**This is not an error in the app, and nothing in the code triggered it.** The
domain is on Google's **Safe Browsing** blocklist, a reputation verdict about
the domain itself that every major browser consults. The app behind it can be
flawless; the interstitial comes up all the same, in front of every page and
every sign-in link, for every visitor.

Why a freshly launched SAAS app earns that verdict is worth spelling out,
because each ingredient looks harmless alone:

- **The domain is brand new.** No history is itself a risk signal — phishing
  domains are hours old, so young domains start with negative trust.
- **It serves a sign-in form and mails out token links.** That is exactly what
  a credential-phishing site does. The classifiers cannot read intent, only
  shape — and the shape matches until reputation says otherwise.
- **The sender domain does not match the link domain.** A mail from
  `demo@somewhere-else.com` whose button points at `your-domain.de` is the
  single strongest phishing heuristic there is. Recipients hit "report
  phishing", filters agree, and those reports feed the same lists Chrome
  reads. The sender rule in [`docs/auth-setup.md`](auth-setup.md) → *What the
  mails look like* exists to keep this ingredient out entirely.

**Getting off the list** is a review request, and only the domain owner can
file it:

1. Verify the domain in **Google Search Console** (DNS record or file upload —
   the skill `go-live` walks through it).
2. *Security issues* names what Google believes it saw — usually "Deceptive
   pages" for this pattern. If the panel is empty, check the verdict at
   Google's Safe Browsing status page
   (`transparencyreport.google.com/safe-browsing/search?url=your-domain.de`).
3. **Request a review** from that panel, in one or two sentences: what the
   product is, that sign-in links are sent only to addresses that asked for
   them. Reviews of false positives typically clear in one to three days.

**Preventing it** is cheaper than clearing it, and it is three lines of
go-live discipline: the sender address lives on the app's own domain and is
DKIM/SPF-verified there; the Impressum and privacy policy are filled in before
the first stranger gets a mail (`node run.mjs legal-check` — a placeholder
Impressum on a live domain reads exactly like a throwaway phishing site); and
the domain is verified in Search Console **at** launch, not after the flag,
because Search Console is also where Google would tell you about the flag —
without it the first person to learn of the interstitial is a customer.
