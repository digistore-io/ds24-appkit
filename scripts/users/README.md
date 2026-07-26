<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Users & roles — CLI

Small, **idempotent** scripts for creating app users and assigning roles.
Plain Node ESM — no build needed. They can be run by hand or by Claude Code
(e.g. in the skill `build-app`, when the operator account is set up).

## Prerequisite (env)

```bash
export DATABASE_URL="postgresql://…"   # the same DB as the app (see .env)
# locally: `docker compose up -d` starts Postgres
```

## Roles

The `users` table has a `role` field (see `db/schema.ts`):

- **`owner`** — SAAS operator (admin). Access to admin areas (`requireOwner()`).
- **`member`** — regular customer (the default for self sign-in).

`--role` accepts the aliases `admin` (→ `owner`) and `user` (→ `member`).

## Creating a user / setting a role (upsert by email)

```bash
# Dry run (only shows what would happen):
node scripts/users/create-user.mjs --email owner@example.com --role owner

# Execute (create OR change the role of an existing email):
node scripts/users/create-user.mjs --email owner@example.com --role owner --apply

# Optionally with a name; without --role, "member" is set:
node scripts/users/create-user.mjs --email customer@example.com --name "Max K." --apply
```

The operator then signs in at `/login` via an **email magic link** — the row
created up front is reused, so he is an `owner` right away.

## Listing users

```bash
node scripts/users/list-users.mjs            # all
node scripts/users/list-users.mjs --role owner
```

## Via the runner (from the repo root)

```bash
node run.mjs user-create --email owner@example.com --role owner --apply
node run.mjs user-list --role owner
```

Dry run is the default; only `--apply` writes. `create-user.mjs` is idempotent
(upsert by email), `list-users.mjs` is read-only.
