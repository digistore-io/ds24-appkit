<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Media — pictures, video, recordings, and the files you sell

> **Needs template 0.7.0 or newer.** `lib/media/` and the `image` task arrived
> with it. If `node run.mjs media-check` is not a command your app has, this
> document is describing code you do not carry yet — `node run.mjs update`
> brings the text, not the code, so the way to get both is a newer template.

Everything your app puts in front of a customer that is not text goes through
one place: `lib/media/`. Four kinds — **image, video, audio, file** — one store,
and three answers to "who may fetch this".

Check it any time with:

```bash
node run.mjs media-check
```

That command writes a throwaway object, reads it back, compares the bytes and
deletes it again. Credentials that look right and a bucket that does not exist
are indistinguishable until something tries.

---

## Where the files live, and why that is not a detail

**In development:** nothing to set up. Files go to `.data/media/` on your
machine and everything works.

**Online: a bucket, or the app does not start.**

That refusal is deliberate and it is the one thing in this document worth
reading twice. A local disk works perfectly while your app runs on one machine,
which is exactly the problem — the failure it produces only appears *after* you
are successful:

- The next redeploy loses every file that was ever uploaded.
- A second instance has its own disk. An upload lands on one, the next request
  is answered by the other, so a customer's picture is there **about half the
  time**. To them the app is losing things; to you it is a bug you cannot
  reproduce, because you are testing on one machine.

A warning is the wrong instrument for a fault that stays invisible until it is
expensive. So `lib/env-guard.ts` refuses to start in STAGING and PROD without
object storage, the same way it refuses to start without mail delivery.

### Any S3-compatible bucket does

The app signs its own requests, so these are all the same code path with a
different endpoint:

| | Endpoint looks like |
|---|---|
| Amazon S3 | `https://s3.eu-central-1.amazonaws.com` |
| DigitalOcean Spaces | `https://fra1.digitaloceanspaces.com` |
| Cloudflare R2 | `https://<account>.r2.cloudflarestorage.com` |
| Backblaze B2 | `https://s3.eu-central-003.backblazeb2.com` |
| Hetzner Object Storage | `https://fsn1.your-objectstorage.com` |

```bash
MEDIA_DRIVER=s3
MEDIA_S3_ENDPOINT=https://fra1.digitaloceanspaces.com
MEDIA_S3_REGION=fra1
MEDIA_S3_BUCKET=my-app-media
MEDIA_S3_ACCESS_KEY_ID=...
MEDIA_S3_SECRET_ACCESS_KEY=...
```

The skill **`setup-hosting`** books one alongside your database, so on the
ordinary path you never type these by hand.

`MEDIA_S3_ENDPOINT` must be an **origin** — no path. The bucket name belongs in
`MEDIA_S3_BUCKET`; a path in the endpoint is signed differently from the one the
request uses, so everything answers 403 and nothing says why.
`node run.mjs media-check` refuses it.

You do not have to say which addressing style your provider wants: if the
endpoint's host already begins with the bucket name the key is the whole path,
otherwise the bucket is the first path segment. Both work, and a wrong guess
would be a 404 with no explanation attached.

---

## How a file reaches a visitor

**Never through your app.** That is the rule the whole design hangs on. On a
busy app it is the difference between a server rendering pages and a server
shipping megabytes — and with video it stops being a preference at all, because
a player scrubbing through a recording issues **range requests**, which a bucket
answers by itself and your app would have to reimplement as `206 Partial
Content`, on every node, for every viewer.

| Visibility | What it is | How it is served |
|---|---|---|
| `public` | product imagery — a lesson cover, the hero of a generated page | straight from the bucket or its CDN. No request reaches your app |
| `owner` | what a customer uploaded | the page checks who is asking, then the bucket serves it |
| `entitled` | **the file somebody bought** | `hasPlan()` decides, then the bucket serves it |

For the last two, the **server component decides access while it renders** and
mints an address that expires. That is not an optimisation, it is the only shape
that works: `next/image` will not follow a redirect to another host, so a route
answering `307` with a signed address serves downloads and breaks every
`<Image>`. Moving the check to render time is what lets the bucket serve the
bytes.

```tsx
import { findMedia, mayAccess } from "@/lib/media/manage";
import { mediaUrlFor } from "@/lib/media/url";
import { Figure } from "@/components/ui/figure";

const item = await findMedia(id);
if (!item || !(await mayAccess(item, { memberId, role }))) notFound();

// `media.alt` is nullable — an item seeded through `createMedia()` may carry
// none — so decide what a missing one MEANS rather than passing `""`, which is
// the one value `Figure` refuses. Here it is a decoration.
{item.alt
  ? <Figure src={mediaUrlFor(item)} alt={item.alt} width={800} height={450} />
  : <Figure src={mediaUrlFor(item)} decorative width={800} height={450} />}
```

`mediaUrlFor()` **grants nothing and checks nothing** — it is the step after
`mayAccess()` said yes. Calling it without that check is how a private file
becomes a public one.

### Selling a file

Set the visibility and name the plan. That is the whole feature:

```ts
await createMedia({
  ownerId: operatorId,
  kind: "file",
  mime: "application/pdf",
  bytes,
  filename: "Workbook.pdf",
  visibility: "entitled",
  requiresPlan: "basis_monatlich",   // a key from config/digistore-products.json
  alt: null,
  source: "upload",
});
```

The Product Key is checked by `createMedia()` itself, so this call refuses a
typo rather than storing it. That matters because `hasPlan()` **throws** on a
key it does not know: an unchecked one would not mean "no access", it would take
down the page that renders the item. A token package is refused for a different
reason — a balance is not an entitlement, so `hasPlan()` answers false for one
for ever and nobody would ever get the file.

A key that is retired from `config/digistore-products.json` *later* cannot be
caught at write time, so `mayAccess()` treats it as "nobody holds this plan" and
logs it. Access is refused; the page still renders.

### How long an address stays valid

Per kind, in `config/media.json`. Five minutes for a picture, six hours for
video and audio — because a player asks for more of a recording as somebody
watches it, and an address that expired mid-view looks like a broken video.

**The cost is real and worth knowing:** an address that lives six hours can be
passed to somebody else for six hours. For paid content that is a trade you are
making. If your files must not be shared at all, shorten it and accept that long
recordings will need reloading; there is no setting that gives you both.

---

## Putting files in

An upload travels **through your app**, because that is where it is checked:

> signed in → feature on → under the rate limit → size plausible →
> **the type is read from the bytes, not from what the request claimed** →
> location data stripped (images) → stored

Two of those are worth saying out loud.

**The type comes from the first bytes.** A `Content-Type` in an upload is
written by whoever sent it. Believing it means an app that accepts `image/png`
accepts anything at all, as long as the sender says `image/png`.

**Who may upload what depends on the role.** `config/media.json` → `mayUpload`.
A member uploads pictures and PDFs; archives are the operator's. A customer who
can hand every other customer a `.zip` is not a media feature.

There is no SVG anywhere on the list, and there should not be: an SVG is a
document that can carry script, so serving one a customer uploaded is handing
every later visitor code somebody else wrote.

### The ceiling, and what lies beyond it

Because uploads pass through the app, there is a size limit — tens of megabytes,
set per kind in `config/media.json`. Enough for a picture, a PDF or a short
clip. **Not** enough for a lesson recording.

The way past it is the browser writing **straight to the bucket**: your app
mints a short-lived upload address, the file never touches your server, and a
confirmation step afterwards checks what actually landed rather than believing
the client. That path is not built here yet. What it needs, when you want it:

1. `createUploadUrl()` beside `put()` in `lib/media/store.ts` — a presigned
   `PUT`.
2. A CORS rule on the bucket, or the browser refuses the request before it
   starts.
3. A confirm step that `HEAD`s the object and sniffs its first bytes. Without it
   the client tells you what it uploaded, which is the one thing this whole
   layer refuses to accept anywhere else.
4. A sweep for uploads that were started and abandoned.

The four kinds already exist, so this arrives as a second way into the same
store — it changes neither the row, nor the delivery, nor the access check.

---

## Letting the app draw

```ts
import { generateImage } from "@/lib/media/generate";

const [hero] = await generateImage({
  prompt: "a quiet kitchen table at sunrise, warm light, no people",
  alt: "A kitchen table in early morning light",
  visibility: "public",
});
```

What comes back is a stored `media` row — the picture is already in the bucket,
and `mediaUrlFor(hero)` is the address to put on a page. The cost is recorded
with every other model call and appears on `/dashboard/admin/ai-costs`.

Three things worth knowing before you use it:

- **Not every provider can.** Anthropic makes no pictures at all; Mistral only
  through a detour this template does not take. `node run.mjs ai-check` says
  which of your keys would work, at the moment you check rather than at your
  customer's first click.
- **`alt` is required and is not the prompt.** A prompt reads *"photorealistic,
  8k, cinematic lighting"* and is instructions for a machine; alternative text
  is a sentence for a person who cannot see the picture. Using one as the other
  produces accessibility that is technically present and useless.
- **Charge for it in your Server Action, not in the library** — `spendTokens`,
  in the order check → work → charge. `generateImage()` deliberately does not,
  because a debit inside a library is a debit a cron job can trigger.

The full reference, including what a picture costs and how to bind the task to a
different company, is [`docs/ai-providers.md`](ai-providers.md) → *Pictures*.

---

## What to build instead of a wall of text

This is the part worth reading before you design a page. Every row is the same
feature delivered one step further along — not a bigger feature, a finished one.

| Instead of | Build |
|---|---|
| sales copy in a text box | a **rendered sales page** under its own address, with a hero image, that the customer can share or hand to a client |
| a challenge message as a paragraph | the message **with a picture**, and the run of days as a bar so somebody can see where they are |
| "your result: 73 / 100" | a **result card** they can download and show somebody — the number, what it means, your name on it |
| a report as a table | the same report **with a chart above it**. The table stays; it is the answer to "what exactly" |
| a lesson as text | the lesson **with a cover picture**, and a video where there is one |
| a list of suggestions | the same suggestions as **cards with previews**, so choosing is looking rather than reading |
| a bare "done ✓" | what was produced, **shown** — the thing itself, small, with a way to open it |

**The pattern under all of them:** find the last step your customer currently
has to do themselves, and do it for them. That step is usually where they would
have been willing to pay.

**What NOT to do:** decoration. A stock photograph at the top of a settings page
is not this. Every row above shows the customer *their own thing* — their page,
their result, their progress. A picture that would be identical for every
customer is a picture nobody needed.

**And there is a second question next door.** This section is about what the
customer is *handed*; [`ai-in-product.md`](ai-in-product.md) is about what the
app *does with them* while they work — reading what they submitted, walking them
through it, producing the thing together. An app usually wants both.

---

## Asking a customer to produce or choose something

Half of a good visual feature is what the app does when it hands the work back
to the person. Five rules, and the first is the one that gets skipped.

**Offer, do not demand.** Three variants to pick from beats one take-it-or-
leave-it, and beats an empty field by a mile. Somebody looking at three
pictures decides in two seconds; somebody looking at an empty prompt box
closes the tab.

```tsx
// Three at once, then let them choose. Costs three times as much per attempt
// and saves the four attempts a bad first result would have caused.
const options = await generateImage({ prompt, alt, n: 3, ownerId: memberId });
```

**Say what it costs before it is spent.** Not in the ledger afterwards. "Das
kostet 5 Token" next to the button, every time — a customer who discovers a
price after the fact stops trusting every other button on the page.

**Let them correct it with a sentence.** "Make it warmer", "no people in it" —
appended to the original prompt, not typed again from scratch. Starting over is
how a customer decides the feature is not worth it.

**Always leave a way past.** Upload your own, or continue without one. A
required visual step is a wall in the middle of a flow somebody paid to get
through.

**Do not produce what nobody will see.** A generated picture with no place on
the page is paid-for compute. Build the place first.

---

## Recipes

The things below are **not** components in this template, deliberately: each is
thirty to sixty lines against what already ships, and a feature most apps carry
and few use is worse than no feature at all. Copy what you need into your app.

They are written against the colour tokens in `app/globals.css`, which is what
makes them correct in light and dark **without a single `dark:` class** — the
token changes value, the markup does not. None of them adds a dependency.

### A bar chart, server-rendered

```tsx
export function Bars({ data, max, label }: {
  data: { name: string; value: number }[];
  max: number;
  label: string;
}) {
  // A day with nothing on it is a real input, and `value / 0` is `NaN%` —
  // which CSS drops, so every bar renders full width.
  const top = Math.max(max, 1);

  return (
    // `role="img"` plus a name: a screen reader announces the sentence instead
    // of reading seven numbers nobody can hold in their head.
    <div role="img" aria-label={label} className="space-y-2">
      {data.map((row) => (
        <div key={row.name} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-sm text-muted-foreground">{row.name}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.round((row.value / top) * 100)}%` }}
            />
          </div>
          <span className="w-12 shrink-0 text-right text-sm tabular-nums">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
```

No SVG needed for the commonest chart there is, and no client JavaScript: it is
`div`s with a width. `tabular-nums` keeps the figures from jittering.

### A line, as SVG

```tsx
import { useId } from "react";

export function Line({ points, label }: { points: number[]; label: string }) {
  // Ids have to be unique on the page, and two charts on one page is the
  // ordinary case. A fixed `id="t"` makes the second chart's label point at the
  // first one's — silently, because nothing validates an aria reference.
  const id = useId();
  const max = Math.max(...points, 1);
  // One point is a line of zero length, not a division by zero.
  const span = Math.max(points.length - 1, 1);
  const d = points
    .map((v, i) => `${(i / span) * 100},${30 - (v / max) * 28}`)
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 30"
      className="h-24 w-full"
      role="img"
      aria-labelledby={`${id}-t ${id}-d`}
    >
      {/* `title` and `desc` are what a screen reader reads. An SVG without them
          is announced as "graphic" and nothing else. */}
      <title id={`${id}-t`}>{label}</title>
      <desc id={`${id}-d`}>{`${points.length} values, highest ${max}`}</desc>
      <polyline
        points={d}
        fill="none"
        // `currentColor` inherits from the class — so the token decides, and
        // light/dark follows without a second code path.
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-primary"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
```

`vectorEffect="non-scaling-stroke"` is the line that gets left out: without it
the stroke is scaled by the viewBox and a wide chart draws a hairline.

### A gallery

```tsx
{items.map((item) =>
  // `alt` or `decorative` — never `alt=""` on a picture that shows something.
  // An empty alt tells a screen reader to skip it, which is right for a
  // divider and wrong for a photograph somebody uploaded. There is no third
  // answer, which is why `Figure` refuses to compile without one of the two.
  item.alt ? (
    <Figure
      key={item.id}
      src={mediaUrlFor(item)}
      alt={item.alt}
      width={400}
      height={300}
      className="aspect-[4/3] object-cover"
    />
  ) : (
    <Figure
      key={item.id}
      decorative
      src={mediaUrlFor(item)}
      width={400}
      height={300}
      className="aspect-[4/3] object-cover"
    />
  ),
)}
```

In a `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`. The fixed aspect ratio is what
stops one portrait picture from making a row twice as tall as its neighbours.

### A video from YouTube or Vimeo — **with the consent gate**

⚠️ **This is the one recipe with a legal consequence attached.** A bare
`<iframe src="https://www.youtube.com/…">` contacts Google the moment the page
loads, before the visitor has agreed to anything, and sets identifiers on their
device. That is § 25 TDDDG — consent required, no exception for "it is just an
embed" — and it is exactly the kind of thing a supervisory authority checks
because it takes ten seconds to verify from the outside.

**Nothing may reach the video host before the visitor says yes.** So the page
shows a still and a button, and the iframe comes into existence only afterwards:

```tsx
"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Figure } from "@/components/ui/figure";

export function VideoEmbed({ id, title, poster }: {
  id: string; title: string; poster: string;
}) {
  const t = useTranslations("video");
  const [agreed, setAgreed] = useState(false);

  if (!agreed) {
    return (
      <div className="relative overflow-hidden rounded-md bg-muted">
        {/* Your OWN still, from your own bucket. A thumbnail fetched from
            youtube.com is the same contact this whole component prevents —
            and `Figure` rather than `<img>` because that is the rule
            everywhere else in this app. */}
        <Figure src={poster} alt={title} width={1280} height={720}
                className="w-full opacity-60" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
          <p className="text-sm">{t("consentBody")}</p>
          <Button onClick={() => setAgreed(true)}>{t("consentAction")}</Button>
        </div>
      </div>
    );
  }

  // `youtube-nocookie.com` is not a substitute for the gate — it reduces what
  // is set, it does not remove the contact. It belongs here, after the yes.
  return (
    <iframe
      src={`https://www.youtube-nocookie.com/embed/${id}`}
      title={title}
      allowFullScreen
      className="aspect-video w-full rounded-md"
    />
  );
}
```

**Recording the yes: read this before reaching for `recordConsent()`.**

On a **public page the click IS the consent, and there is nothing in this app to
record it in.** `recordConsent()` opens with `requireActiveUser()`, which sends
an anonymous visitor to `/login` — so calling it here does not fail quietly, it
ejects the person who was about to watch your video. `components/consent-dialog.tsx`
says why: anonymous device-access consent under § 25 TDDDG is a different
mechanism with a different store, and it cannot be a row against a member who
does not exist yet. What you have instead is the gate above: nothing is
contacted until somebody acts, which is what the rule asks for.

Behind the **sign-in**, where there is a member, you can record it — and then it
is worth doing, because a record is what demonstrates consent was given
(Art. 7(1) GDPR):

```json
{ "purposes": [{ "key": "videoEmbed", "textVersion": "2026-07-30" }] }
```

Then the four steps `compliance-check` prescribes: the purpose above, the
wording as `consent.videoEmbed.title` / `.body` in **both** message files, ask
with `<ConsentDialog>`, and gate the iframe on
`hasConsent(memberId, "videoEmbed")` rather than on `useState`. Bump
`textVersion` whenever you change the sentence — everybody who agreed to the old
one counts as unasked again.

**The way out of all of this:** host the video yourself. A `video` item in your
own bucket contacts nobody, needs no consent, no gate and no purpose — and
`<MediaPlayer>` plays it. The embed exists for videos you do not have the file
for.

---

## What is taken off an image, and what is not

Location and camera data are removed from uploaded **JPEG, PNG and WebP** before
anything is stored. A phone photograph carries where it was taken, to a few
metres, and nobody looking at the picture can tell it is there.

**Video is not touched.** An MP4 can carry its recording location in an atom,
and removing it means walking the atom tree and rewriting the offsets that
depend on it — half of which is worse than none, because a half-stripped file
reads as protected. This is in `docs/data-protection.md` as well, so a privacy
policy written from that inventory is true.

Colour profiles are deliberately kept. Removing one changes how a picture looks;
it says nothing about where somebody was standing.

---

## The construction kit

| For | Use |
|---|---|
| an image | `<Figure>` — `alt` is required **by the type**, so a missing one is a compile error rather than a finding somebody has to go looking for |
| a decorative image | `<Figure decorative>` — no `alt`, hidden from screen readers |
| video or audio | `<MediaPlayer kind="video" label="…">` |
| a file to download | `<MediaDownload>` — name, type and size, because a 40 MB file on a phone is a decision and not a click |

`decorative` is the right answer for a divider or a texture and the wrong answer
for anything a reader would miss. Nobody but the person writing the page can
tell those apart, which is why the component asks.

---

## Where things are

| | |
|---|---|
| `lib/media/store.ts` | the one entry point; picks the driver |
| `lib/media/s3.ts`, `local.ts` | the drivers — the only files that read a storage credential |
| `lib/media/sigv4.mjs` | request signing, measured against AWS's own published test vectors (`sigv4-vectors.json`) |
| `lib/media/manage.ts` | rows and bytes, kept in step |
| `lib/media/rules.ts` | the pure rules — what is allowed, how big, what key |
| `lib/media/sniff.ts` | what a file really is |
| `lib/media/exif.ts` | taking the metadata off |
| `config/media.json` | kinds, ceilings, who may upload what, address lifetimes |
| `db/schema-media.ts` | one row per item |

Deleting an account removes the objects from the bucket, not only the rows — a
Postgres cascade does not reach into storage, and files left behind would be a
deletion request that was not honoured.
