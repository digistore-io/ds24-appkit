---
name: mcp-server
description: Sets up the app's MCP server — the interface through which customers connect Claude or another AI program to this app. Decides WHICH of the app's capabilities are worth exposing as tools and which must not be, writes them into lib/mcp/tools.ts, and switches the interface on. Use this when the user wants an AI/Claude integration, mentions MCP, a "connector", "Claude should be able to use my app", or an API for AI agents.
---
<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# The MCP server — decide what to expose, then expose it

This app can be a **tool that Claude uses**. A customer creates a key, pastes it
into Claude Code or claude.ai, and from then on the model can ask your app things
and do things in it — as that customer, with that customer's data.

The infrastructure is already here and it works: endpoint, keys, scopes, rate
limits, billing hookup. **None of that is the job.** The job is the one question
infrastructure cannot answer:

> **Which of this app's capabilities belong in the hands of a language model
> that is reading text other people wrote?**

Get that wrong in the generous direction and a prompt injection in a customer's
document deletes their data. Get it wrong in the timid direction and you ship a
connector that can only say hello. That decision is this skill.

Full reference — endpoint, protocol, security, how a customer connects:
**`docs/mcp.md`**. Read it before changing anything under `lib/mcp/`.

## Step 0 — Is this wanted here at all?

Ask once, plainly, and be honest that it is not free.

> "Shall your app be usable from Claude? Your customers would connect it once,
> and could then ask Claude things like 'what did I spend last month?' or have it
> do things in your app for them — without opening it. It costs nothing to run,
> but I'd need about ten minutes with you to work out what Claude may and may not
> touch."

If they hesitate or do not know what it would be for, **stop and say so**. An MCP
server nobody has a use for is three example tools and a support surface. It can
be switched on later in one line.

If yes, name the server in the same breath — it is what clients show next to the
customer's key:

```json
{ "enabled": true, "serverName": "acme-invoices", "requiresPlan": null }
```

`serverName`: short, lower case, no spaces. Usually the app's name.

## Step 1 — Interview: what do people actually ask this app?

Use `AskUserQuestion`, one theme at a time, and summarize back after each. Do
**not** invent the answers — a tool list you made up is exactly the failure this
step exists to prevent.

1. **What is the app for?** In one sentence, in the user's words. Everything
   below is measured against it.
2. **What do customers look up?** "Where do they go in the app to *read*
   something?" Every screen that answers a question is a candidate read tool.
   Push for the boring, repeated lookups — those are the ones worth automating.
3. **What do customers do?** "What do they *create, change or send*?" These are
   the candidate write tools, and the ones to be careful with.
4. **What would be a disaster?** Ask it in exactly those terms: *"If Claude got
   confused and did one thing in your app that it shouldn't — what is the thing
   you'd least want that to be?"* Whatever they name goes on the do-not-expose
   list, and it stays there.
5. **Who has to have paid?** Every member, or only a plan? If a plan, it is a
   `kind: "subscription"` or `"one_time"` key from
   `config/digistore-products.json`. A **token package cannot gate anything** — a
   balance is not an entitlement, and `hasPlan()` answers false for one for ever.
6. **Does a call cost tokens?** Only if this app sells tokens (`billingMode` in
   `config/digistore-products.json`). If it does: what should one call cost? A
   read is usually free; expensive work is not.

## Step 2 — Decide: the three lists

Sort every candidate from step 1 into one of three lists and **show the user the
lists** before writing any code. This is the part that needs a human to agree
with it.

### ✅ Expose — read tools

Anything that answers a question about **this customer's own data**. These are
almost always safe, they are what makes the connector useful, and they should be
the bulk of what you ship. Mark them `readOnly: true`.

### ⚠️ Expose carefully — write tools

Something that changes data or costs money. Each one needs a specific reason to
exist, and each one needs `readOnly: false` so a read-only key cannot reach it.
Ask per tool: *"if a model did this at the wrong moment, could the customer undo
it themselves?"*

- **Yes, trivially** (draft something, add a note, set a preference) → fine.
- **No** (send a mail to a third party, cancel a subscription, delete a record,
  place an order) → **do not expose it.** Offer the read half instead: a tool
  that *prepares* the thing and returns it for the customer to confirm in the app
  is the same value with none of the risk.

### ⛔ Never expose

Say these out loud so the user knows they were considered and rejected:

- **Anything an Operator does to somebody else.** `requireOwner()` operations —
  block a user, adjust a balance, grant a plan, read another customer's record.
  The blast radius of a leaked customer key is that customer; of an operator
  tool, the business.
- **Anything that spends money outward** — placing orders, triggering payouts,
  charging a card.
- **Anything irreversible** — deletions, cancellations, anything with a
  statutory retention period behind it (`orders` is an accounting record).
- **Anything that sends to a third party** — mail, SMS, webhooks. A model that
  can send mail from your domain is a phishing tool with your reputation on it.
- **Secrets and credentials.** No tool returns an API key, a password hash, a
  token, or `users.passwordHash`. Ever.

Then say the sentence that makes the list real:

> "Everything on the first two lists is what Claude will be able to do as your
> customer. Everything on the third stays inside the app. Is that the line you
> want?"

## Step 3 — Write the tools

Open `lib/mcp/tools.ts`. **Delete the three example tools** — they are
demonstrations of the three patterns, not product — and write the agreed list in
their place. Keep one example open beside you until the first real tool compiles.

The shape, and the rules that are not style (all seven are in `docs/mcp.md`;
these four are the ones that get broken):

```ts
const findInvoice: McpTool = {
  name: "find_invoice",                    // lower_snake_case
  description:
    "Finds one of this account's invoices by number. Use it whenever the user " +
    "asks about a specific invoice rather than a list.",   // ← written FOR A MODEL
  inputSchema: {
    type: "object",
    properties: { number: { type: "string", description: "The invoice number." } },
    required: ["number"],
    additionalProperties: false,
  },
  readOnly: true,          // changes NOTHING — no writes, no charges, no mail
  requiresPlan: null,      // or a subscription/one_time key
  costTokens: 0,

  async run(args, ctx) {
    const number = typeof args.number === "string" ? args.number.trim() : "";
    if (!number) return toolFailure("The 'number' argument is required.");

    const invoice = await findInvoiceFor(ctx.memberId, number);   // ← ctx.memberId
    if (!invoice) return toolFailure(`No invoice ${number} on this account.`);
    return toolData({ number: invoice.number, total: invoice.totalCents });
  },
};
```

1. **`ctx.memberId`, never an argument.** The account is proven by the key. A
   `memberId` in `inputSchema` is an IDOR with a language model holding the pen —
   `tools.test.ts` fails the build on one.
2. **Re-validate every argument.** The schema is a hint to a model, not a check.
   Treat `args` exactly as you treat a `FormData` in a Server Action.
3. **`readOnly` is a security boundary**, not documentation. A read-only key is
   refused a `readOnly: false` tool *before* the handler runs. Anything that
   costs tokens is not read-only, and the build enforces that.
4. **A tool that ran and could not do it returns `toolFailure(...)`.** Not a
   thrown error. The model reads that text and adapts; a protocol error just
   makes it retry the identical call.

**If a tool costs tokens**, the order is check → work → charge:

```ts
const account = await getTokenAccount(ctx.memberId);
if (!hasSufficientBalance(account?.balance ?? 0, COST)) {
  return toolFailure(`Not enough tokens: this call costs ${COST}. The user can top up under Plans.`);
}
const result = await doTheWork();
await ctx.spend(COST, "mcp: find_invoice");   // a LABEL, never the customer's content
```

### Descriptions are the highest-leverage strings you will write

The model decides whether to call a tool from its description alone. Say **when
it applies**, not only what it is. Write them, then read them back to the user as
plain sentences — they know their customers' vocabulary and you do not.

> ❌ `"Invoice lookup."`
> ✅ `"Finds one of this account's invoices by number. Use it whenever the user asks about a specific invoice rather than a list."`

Also fill in `instructions` in `config/mcp.json` — one or two sentences telling
the model how this app fits together and which tool to reach for first. It is
the cheapest quality win available.

## Step 4 — Check it, then use it yourself

```bash
node run.mjs test                 # the registry's invariants
node run.mjs start
node run.mjs mcp-check --live     # mints a temporary key and really calls it
```

`mcp-check --live` prints the tool list exactly as a client sees it. Read it as a
model would: **if you cannot tell from the descriptions alone which tool answers
which question, neither can Claude.** Fix the descriptions, not the code.

Then connect a real client and try it, because a tool list that lists correctly
is not a tool that works:

```bash
claude mcp add --transport http acme http://localhost:3000/api/mcp \
  --header "Authorization: Bearer ds24mcp_…"
```

Get the key the way a customer does — sign in, `/dashboard/account` → **AI
interface (MCP)** → create a key. Do that once yourself; it is the flow every one
of your customers will go through, and it is where they get stuck if the copy is
unclear.

Ask it two or three real questions. Watch which tools it picks. A model reaching
for the wrong tool is nearly always a description problem.

## Step 5 — Tell the user what they now have

Three things, in their words, no jargon:

1. **What it does** — "your customers can connect Claude to your app and ask it
   *these* things".
2. **How they connect** — `/dashboard/account`, create a key, paste it in. The
   key is shown once.
3. **What it cannot do** — read out the ⛔ list. This is the reassurance that
   makes people comfortable switching it on, and it is also the record of a
   decision they agreed to.

If the app sells tokens and any tool costs some, say what a call costs and
suggest watching `node run.mjs logs` for the first few days — every call logs one
line with the tool name and its cost.

## When somebody asks for OAuth

They will eventually — usually because a client's IT does not like shared
credentials, or because they want one-click connection on claude.ai.

**Do not build it here.** `docs/mcp.md` explains the trade and where the seam is
(`authenticate()` in `lib/mcp/keys.ts` is the only place a bearer value becomes a
member id). Adding an authorization server — `/authorize`, `/token`, PKCE,
client registration, consent screen, refresh rotation — is a security-critical
subsystem, and this template's owner is usually not a developer. Say that
plainly, and check first whether request-header authentication on claude.ai
already solves their actual problem.

## STOP criteria

Involve a human before:

- exposing anything on the ⛔ list, whatever the reason given;
- a tool that writes to a table this skill has not seen;
- changing anything in `lib/mcp/keys.ts`, `lib/mcp/rules.ts` or
  `app/api/mcp/route.ts` — that is the authentication and authorisation path, and
  `guardrails` applies to it;
- raising `PROTOCOL_VERSION` in `lib/mcp/protocol.ts`. Announcing a version is a
  promise about behaviour — see the note in `docs/mcp.md`.
