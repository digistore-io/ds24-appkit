# Setting up sign-in

By default the app uses **email token sign-in (magic link)**. The user enters
their email, gets a sign-in link sent to them and is signed in after clicking
it. For that the app needs **mail delivery**: either **Postmark** or **SMTP**.
**Google sign-in is optional** on top of that.

**A password is optional too — and it is the Member's choice, not yours.**
Anyone signed in can set one on their own account page (`/dashboard/account`)
and remove it again just as easily. It saves the round-trip through the inbox
and works on a machine where their mail is not open. There is nothing to set up
for it: no environment variable, no provider to enable. An account without a
password behaves exactly as it always did, which is the common case and stays
that way.

Two consequences worth knowing before you go looking for them:

- **There is no "forgot password" flow, and none is missing.** Whoever forgets
  theirs signs in with a magic link exactly as before and sets a new one. The
  magic link *is* the recovery path, which is why mail delivery stays a hard
  requirement even for accounts that have a password.
- **Four things are rate-limited**, all in a sliding window (`lib/rate-limit.ts`):
  failed password sign-ins, ten per quarter hour per address **and thirty per
  quarter hour per origin** — the second catches one password sprayed across
  many accounts from one source, which the per-address counter cannot see
  because it only ever gets one hit per address. The origin comes from
  `x-forwarded-for`, so it is only meaningful behind a proxy that overwrites
  that header, which every hoster this template targets does; without one the
  limit simply does not engage. Then: requests to
  change an address, three per hour — counted per account *and* per target
  address, so the same mailbox cannot be hit again from the next account; and
  address *lookups*, twenty per hour per account, which meters the "that address
  is already taken" answer so it cannot be used to enumerate accounts for free.
  The counters live in memory, in one process — run several app instances
  behind a load balancer and each keeps its own, which multiplies every limit
  by the number of instances. That is a known limitation of the single-process
  shape this template ships with, not an oversight.
- **Members change their own address**, confirmed by a link sent to the new one
  (`/dashboard/account` → `/account/confirm-email`). Nothing moves until that
  link is followed, so an abandoned or mistyped request costs nothing and the
  old address keeps working throughout. The confirmation page needs no session —
  the mail is read wherever the inbox is.
- **Every credential change mails the Member** — set, changed, removed, and the
  address change tells the address the account just left. Without
  it, somebody who reaches an unlocked machine could set a password on the
  account and the owner would never learn of it. The notice deliberately
  contains **no link**, so it is safe to receive and useless to forge; what the
  recipient does with it is contact you. Where no transport is configured the
  change still goes through and the notice is skipped with a log line — a
  failed mail must never undo a password the Member has already set.

All values go into the `.env` (template: `.env.example`). Always set the basics:

```bash
AUTH_SECRET=        # filled in locally by `node run.mjs start`
AUTH_TRUST_HOST=true
APP_URL=https://your-domain.de
# APP_NAME=My App      # optional, appears in the sign-in mail
```

## Mail delivery — option A: Postmark (recommended, simple)

1. Create an account at [postmarkapp.com](https://postmarkapp.com), create a
   **server** and copy its **server API token**.
2. Under *Sender Signatures* (or a whole domain) **verify your sender
   address** (set DKIM/Return-Path). This address is the "sender ID".
3. Into the `.env`:

```bash
POSTMARK_SERVER_TOKEN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
POSTMARK_SENDER=login@your-domain.de    # verified sender
# POSTMARK_MESSAGE_STREAM=outbound       # default
```

## Mail delivery — option B: SMTP (any mailbox)

Works with any mail server/mailbox (e.g. your own host). Into the `.env`:

```bash
SMTP_HOST=smtp.yourprovider.de
SMTP_PORT=587            # 587 = STARTTLS, 465 = SSL
SMTP_SECURE=false        # true only on port 465
SMTP_USER=mailbox@your-domain.de
SMTP_PASSWORD=…
SMTP_FROM=login@your-domain.de
```

If **neither Postmark nor SMTP** is set, email sign-in is not offered.

## Google sign-in (optional)

Convenient for users, but **setup + approval take time**: Google reviews apps
with an OAuth consent screen; approval for external users can take **several
days to weeks**. Until then sign-in only works for manually entered test
users. Email sign-in is ready to go right away — Google can be added later at
any time.

Steps in the [Google Cloud Console](https://console.cloud.google.com/):

1. Create a project (or pick an existing one).
2. **APIs & Services → OAuth consent screen**: enter user type "External", app
   name, support email, domain(s) and developer contact. The scopes `email`,
   `profile`, `openid` are enough. Start in **test mode** (enter test users),
   later "Publish" → go through Google **verification** (takes a while).
3. **APIs & Services → Credentials → Create OAuth client ID** → type
   "Web application".
   - **Authorized redirect URIs**:
     `https://your-domain.de/api/auth/callback/google`
     (locally also `http://localhost:3000/api/auth/callback/google`).
4. Client ID + secret into the `.env`:

```bash
GOOGLE_CLIENT_ID=…apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=…
```

## Verifying

After setting the variables: start the app, open `/login` — the email form
appears (and, if configured, "Continue with Google"). Enter the email → the
link arrives → clicking it signs you in. Verification tokens live in the DB
table `verificationTokens` (Drizzle adapter).

## Creating the operator/admin account

**Locally you do not have to do anything.** The very first account in a fresh
app becomes `owner` by itself — sign in at `/login` with any address you like,
and the admin area plus the "Users" entry in the navigation are there right
away. The rule and its boundary live in `lib/users/bootstrap.ts`.

**That bootstrap applies in DEV only, deliberately.** In STAGING and PROD the
first person to sign in is not necessarily you — a freshly deployed instance
has an empty user table too, and the first visitor may be a customer. Handing
them user management would be an account takeover. There you create your
account up front instead.

Accounts otherwise come into being on the first magic-link sign-in with role
`member` — a password never creates one, it can only be added to an account
that already exists. So that the **operator** can sign in as admin (`owner`),
create the account **up front** via CLI (the row is reused at sign-in):

```bash
node scripts/users/create-user.mjs --email owner@example.com --role owner --apply
# or: node run.mjs user-create --email owner@example.com --role owner --apply
```

Roles: `owner` = operator/admin, `member` = customer. Protect admin areas with
`requireOwner()` (`lib/authz.ts`). Details: `scripts/users/README.md`.

## "JWTSessionError: no matching decryption secret"

If this appears in the log (or in the Next.js dev overlay) on a page that only
reads the session, no one has attacked anything: the browser is holding a
session cookie from **another** installation. Cookies know nothing about ports,
so every app on `localhost` shares one cookie store — and a cookie encrypted
with a different `AUTH_SECRET` cannot be decrypted with this one.

Locally the app avoids this by itself: the session cookie carries a short
fingerprint of `AUTH_SECRET` in its name (`lib/auth/cookie-names.ts`), so two
installations never reach for the same cookie. In STAGING/PROD each app has its
own domain and the Auth.js defaults apply.

So if you do see the message, the app is running with `APP_ENV` other than
`development`, with a non-local `APP_URL`, or with no `AUTH_SECRET` — check
`.env`. Deleting the `authjs.*` cookies in the browser clears the leftover.
