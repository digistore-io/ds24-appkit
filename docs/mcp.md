<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# The MCP server — your app as a tool for AI clients

This app can expose itself over the **Model Context Protocol**: a customer
connects Claude (or another AI program) to it, and the model can then ask your
app things and do things in it — on that customer's behalf, with exactly the
rights their key carries.

It ships **switched off**. Turning it on is a decision about what your product
exposes, and the skill `mcp-server` walks through it.

---

## The short version

| | |
|---|---|
| Endpoint | `POST /api/mcp` (Streamable HTTP, one JSON response per request) |
| Protocol | `2025-11-25`, also speaks `2025-06-18` and `2025-03-26` |
| Authentication | `Authorization: Bearer ds24mcp_…` — one key per member, created at `/dashboard/account` |
| Switch | `"enabled": true` in `config/mcp.json` |
| What it can do | `lib/mcp/tools.ts` — three example tools, meant to be replaced |
| Check it | `node run.mjs mcp-check` |

---

## Switching it on

1. **Decide what to expose.** This is the whole job; run the `mcp-server` skill.
2. Set it in `config/mcp.json`:

```json
{
  "enabled": true,
  "serverName": "acme-invoices",
  "requiresPlan": null,
  "instructions": "Ask account_overview first — it says what this customer has paid for."
}
```

| Field | Meaning |
|---|---|
| `enabled` | Off ships as the default. An unreadable config also resolves to off. |
| `serverName` | What clients show next to the customer's key. A proper noun, not translated. |
| `requiresPlan` | A product key from `config/digistore-products.json`, or `null` for every signed-in member. Answered by `hasPlan()` — a **token package can never satisfy it**, and the build fails if you name one. |
| `instructions` | Handed to the model on `initialize`. Worth writing: it is the difference between a model that knows your tools are about invoices and one that guesses. |

3. `node run.mjs mcp-check` — it prints what the server would announce and
   refuses anything incoherent.

There is **no environment variable and nothing to configure per environment**.
Unlike the AI assistant, this server calls no API that somebody pays for, so
there is no key to hold. It behaves identically in DEV, STAGING and PROD.

---

## How a customer connects

Each customer creates their own key on **`/dashboard/account` → AI interface
(MCP)**. The key is shown **once** and never again — the database holds a
SHA-256 of it, so nobody can read it back, you included.

Two choices when creating one, and the defaults are the safe ones:

- **Rights** — `read` (default) or `write`. A read-only key cannot run a tool
  that changes anything or costs anything. This matters more than it looks: the
  key sits inside a program driven by a model reading text that other people may
  have written, so a key that can only read cannot be talked into spending.
- **Valid for** — 30 / 90 (default) / 365 days, or no end date.

Ten live keys per member. Revoked and expired ones do not count, so replacing a
key never hits the limit.

### Claude Code

```bash
claude mcp add --transport http acme https://your-app.example.com/api/mcp \
  --header "Authorization: Bearer ds24mcp_…"
```

### Claude Desktop / claude.ai

**Settings → Connectors → Add custom connector**, paste the endpoint URL, and put
the key in **Request headers** under `Authorization` with the value
`Bearer ds24mcp_…` — including the word `Bearer` and the space. Claude sends the
value exactly as typed; without the scheme the server refuses it.

### Anything else

Any MCP client that speaks Streamable HTTP and can set a header works. Locally
the endpoint is `http://localhost:3000/api/mcp` (or whichever port
`node run.mjs status` reports).

---

## Testing it by hand

```bash
KEY="ds24mcp_…"

curl -s -X POST http://localhost:3000/api/mcp \
  -H "authorization: Bearer $KEY" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25"}}'

curl -s -X POST http://localhost:3000/api/mcp \
  -H "authorization: Bearer $KEY" \
  -H "mcp-protocol-version: 2025-11-25" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

What the endpoint answers, and why:

| Situation | Answer |
|---|---|
| No key, wrong key, expired, revoked, blocked account | `401` — all four identical. Telling the caller which would make this an oracle for whether a key exists. |
| Server switched off | `404` |
| `Origin` header present and foreign | `403` — the DNS-rebinding guard the spec requires |
| Unsupported `MCP-Protocol-Version` | `400` |
| More than 120 calls a minute from one member | `429` |
| `GET` or `DELETE` | `405` — no server-initiated stream, no sessions |
| A notification (`notifications/initialized`) | `202`, no body |

---

## Writing your own tools

Everything lives in **`lib/mcp/tools.ts`**. A tool is a name, a description
written *for a model*, a JSON Schema, three flags and a handler:

```ts
const invoiceLookup: McpTool = {
  name: "find_invoice",
  description:
    "Finds one of this account's invoices by its number. Use it whenever the " +
    "user asks about a specific invoice rather than a list.",
  inputSchema: {
    type: "object",
    properties: { number: { type: "string", description: "The invoice number." } },
    required: ["number"],
    additionalProperties: false,
  },
  readOnly: true,
  requiresPlan: null,
  costTokens: 0,

  async run(args, ctx) {
    const number = typeof args.number === "string" ? args.number.trim() : "";
    if (!number) return toolFailure("The 'number' argument is required.");

    const invoice = await findInvoice(ctx.memberId, number);   // ← ctx.memberId
    if (!invoice) return toolFailure(`No invoice ${number} on this account.`);

    return toolData({ number: invoice.number, total: invoice.totalCents });
  },
};
```

Then add it to `TOOLS`. That is the whole registration.

### The rules that are not style

1. **Never take a member id as an argument.** The account is `ctx.memberId`,
   which came from the key. Every argument is written by a model reading text
   somebody else may have authored — a `memberId` argument is an IDOR with a
   language model holding the pen. `tools.test.ts` fails the build on one.

2. **`readOnly` is a security boundary.** A `read` key may run read-only tools
   and nothing else, and the refusal happens *before* your handler. Mark a tool
   read-only only if it changes **nothing**: no writes, no charges, no mail, no
   outbound calls that cost money. When in doubt, it is not read-only. A tool
   with `costTokens > 0` may never be read-only — the build enforces that.

3. **Re-validate every argument.** The schema is a *hint to a model*, not a
   check. Treat `args` exactly as you treat a `FormData` in a Server Action.

4. **The price is yours, in code.** Never read a cost from the arguments.

5. **Check → work → charge.** In that order. Charging first bills for work that
   then fails; working with no check in front gives the result away for free,
   because by the time `ctx.spend()` throws, the expensive part has run.

6. **A tool that ran and could not do it returns `toolFailure(...)`, not an
   error.** The distinction changes what the model does next: a JSON-RPC error
   means "that request was not valid" and the model should stop; an `isError`
   result means "I ran and could not", and the model reads the text and adapts.
   "You do not have enough tokens" is the second kind — sent as a protocol
   error, it produces an identical retry.

7. **Nothing an Operator does to somebody else.** No `block_user`, no
   `adjust_balance`, no `grant_plan`. Those are `requireOwner()` operations, and
   an Operator's key is still a key on a laptop driven by a model reading
   untrusted text. The blast radius of a leaked customer key is that customer;
   of a leaked operator tool, the business.

### Descriptions are the highest-leverage strings in the file

The model decides whether to call your tool from the description alone. Say
**when it applies**, not only what it is.

> ❌ `"Account info."`
> ✅ `"Returns the plans and prepaid token balance of the account this API key belongs to. Call it before answering any question about what the user has access to or whether they can afford an action."`

---

## Security — what protects what

| Concern | What handles it |
|---|---|
| Who is calling | A per-member key, SHA-256 in `mcp_keys`. Never readable back. |
| A key on a machine that changed hands | Expiry (default 90 days) plus revoke, effective immediately. |
| A model being talked into acting | The `read` scope: a read-only key cannot write or spend. |
| Blocked accounts | Checked on every call — `authenticate()` joins `users`. A blocked account whose key still worked would be blocked in the browser only. |
| Someone trying keys | 30 failed authentications per quarter hour per origin. |
| A runaway loop | 120 calls a minute per member, across all their keys. |
| DNS rebinding from a web page | `Origin` validated against `APP_URL` and localhost. |
| Reading another customer's data | No tool takes an account id; `ctx` is bound to the key's owner. |

**In-memory rate limits.** `lib/rate-limit.ts` counts per process. The template
ships as a single Node process, so one Map is the whole picture — run several
instances behind a load balancer and each keeps its own counts, multiplying
every limit by the number of instances. Same limitation as the sign-in limits,
documented in `docs/auth-setup.md`.

**Keys are personal data.** `mcp_keys` is in `docs/data-protection.md`: the name
the member typed, when the key was made and when it was last used. It is deleted
with the account (`cascade`), unlike the billing records.

---

## Why a key and not OAuth

The MCP spec makes authorization **optional** and defines an OAuth 2.1 profile
for servers that want a client to sign a user in on its own. This app does not
implement it, deliberately.

**What a key costs you:** the customer copies a string once. Claude Code takes
it with `--header`; claude.ai takes it under *Request headers* (a feature still
rolling out — customers without it need a client that can set headers).

**What OAuth would cost you:** an authorization server — `/authorize`, `/token`,
PKCE, client registration or Client ID Metadata Documents, a consent screen,
refresh-token rotation, plus RFC 9728 protected-resource metadata. That is a
security-critical subsystem inside an app whose owner is usually not a developer.
A key is a credential you can revoke from a table; a broken authorization server
is a way into every account.

Because there is no OAuth, `/api/mcp` deliberately serves **no**
`/.well-known/oauth-protected-resource` and its `401` carries **no**
`resource_metadata` parameter. Advertising an authorization server that does not
exist sends every well-behaved client on a discovery attempt ending in a 404,
instead of showing the user "paste your key".

**If you do need OAuth later** — you sell to enterprises whose IT forbids shared
credentials, or you want one-click connection on claude.ai — the seam is already
where it needs to be. `authenticate()` in `lib/mcp/keys.ts` is the only thing
that turns a bearer value into a member id; an OAuth path adds a second branch
there and changes nothing above it. Do not start there. Start when a customer
asks.

---

## Keeping up with the protocol

This server announces `2025-11-25`, the current revision.

⚠️ **The next revision, `2026-07-28`, is not a drop-in.** It removes
protocol-level sessions and the GET stream (both of which this server already
does without), and it **requires an `Mcp-Method` header on every request** plus
`Mcp-Name` on `tools/call`, `resources/read` and `prompts/get`. Announcing a
version is a promise about behaviour — do not bump `PROTOCOL_VERSION` in
`lib/mcp/protocol.ts` until the header handling is there, or clients will be
told something untrue about this server.

Adding a newer version is additive: put it in `SUPPORTED_VERSIONS`, implement
what it requires, then move `PROTOCOL_VERSION`.

---

## Why this is hand-written and not the official SDK

`@modelcontextprotocol/sdk` exists and is good. This template does not use it,
for the same reason it hashes with `node:crypto` rather than `bcrypt`: the
surface actually needed is `initialize`, `tools/list`, `tools/call` and `ping`
over one POST route — about two hundred lines — versus a dependency on the
request path of an endpoint carrying customer credentials, in an app whose owner
will not be tracking its releases.

If this server ever grows resources, prompts, sampling or server-initiated
requests, that trade flips. Take the SDK then, and keep `lib/mcp/keys.ts` and
`lib/mcp/tools.ts` as they are — they are the parts that are about your product.

---

## The files

| File | What it is |
|---|---|
| `app/api/mcp/route.ts` | The endpoint. Every check, in order. |
| `lib/mcp/tools.ts` | **What your app exposes.** The file you edit. |
| `lib/mcp/protocol.ts` | JSON-RPC + MCP framing. Pure. |
| `lib/mcp/keys.ts` | Issue, authenticate, revoke. |
| `lib/mcp/rules.ts` | Key format, scopes, lifetimes, limits. Pure. |
| `lib/mcp/spend.ts` | Charging a member for a call. |
| `lib/mcp/config.ts` | `config/mcp.json`, read and validated. |
| `db/schema-mcp.ts` | The `mcp_keys` table. |
| `app/dashboard/account/mcp-*.tsx` | Where a customer gets a key. |
