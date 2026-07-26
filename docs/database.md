# Database & migrations

The app uses **Postgres** with **Drizzle ORM**. The schema lives in
`db/schema.ts` (plus `db/schema-digistore.ts`, `db/schema-tokens.ts`) — that is
the single truth about the table structure.

Changes to the database always go **through migrations**: small SQL files in
`drizzle/` that are checked in and run in the same order in every environment
(local, staging, production). That way the database looks the same everywhere —
and nobody accidentally loses data.

## The path for a schema change

```bash
# 1. Adjust db/schema.ts (add a table/column)

# 2. Generate the migration — Drizzle compares schema and last state
node run.mjs db-generate

# 3. Look at the new file in drizzle/ (is that the expected SQL?)

# 4. Apply it
node run.mjs db-migrate

# 5. Check the migration in — it belongs to the code
git add db/schema.ts drizzle/
```

**Important:** once applied, migration files in `drizzle/` must **not be
changed any more**. Drizzle remembers in the table `__drizzle_migrations` what
has already run. A mistake is corrected by a *new* migration, not by editing
the old one.

## The commands

| Command | What it does | Where |
|---|---|---|
| `node run.mjs db-migrate` | applies pending migrations | locally **and** in production |
| `node run.mjs db-generate` | creates a migration from a schema change | development only |
| `node run.mjs db-reset` | drops everything, migrates again, applies the seed | **locally only** |
| `node run.mjs db-seed` | creates initial data (`scripts/db/seed.mjs`) | development only |
| `node run.mjs db-studio` | view the database in the browser | development only |
| `node run.mjs db-nuke` | deletes container **and** data volume | locally only |

`node run.mjs start` runs `node run.mjs db-migrate` automatically — so the local database is
always up to date at startup.

## `db-push` vs. migrations

`npm run db:push` writes the schema straight into the database, without a migration file.
That is convenient for quick experiments on an **empty local** database, but it
leaves no trace — other environments never get the change.

> **Rule:** In staging and production, only `node run.mjs db-migrate` runs.
> Never `db:push` against a database with real data.

If you have experimented locally with `db:push`, get back in line like this:
`node run.mjs db-reset` (empties everything and builds it cleanly from the migrations).

## Seed data

`scripts/db/seed.mjs` creates initial data for development — by default an
admin (`owner@example.com`, role `owner`) and a customer
(`customer@example.com`, role `member`). Override the addresses:

```bash
SEED_OWNER_EMAIL=me@my-domain.de node run.mjs db-seed
```

The seed must stay **idempotent** (`on conflict do update/nothing`) so it can
run several times. No real customer data, no secrets in the seed.

## Migrations in production

On deploy, `npm run db:migrate` runs **before** the new app version starts —
`docs/DEPLOY.md` describes this for all four hosts. Two rules:

- **Migration first, then deploy.** Create new columns *optional* (nullable) or
  with a default at first, so the old version still running does not break.
- **A backup before risky migrations.** Managed Postgres providers make
  automatic backups — before dropping columns/tables, check that there is one.

That is why you drop columns in two steps: first code that no longer uses them
(deploy it), then a migration that removes them.

## When a migration fails

1. Read the error message — usually existing data collides with a new rule
   (e.g. `not null` on a column that already contains `NULL` values).
2. Reproduce it locally: `node run.mjs db-reset` and then test with realistic data.
3. Repair the migration by regenerating it **locally** (`node run.mjs db-generate`), as
   long as it has not shipped yet. If it has already run in production, write a
   new, correcting migration.

## Local Postgres

Runs via Docker (`docker-compose.yml`), start/stop through `node run.mjs start` / `node run.mjs stop`.
To the outside it listens on **15432**, not on 5432 — that way an already
installed Postgres is not in the way.

If that one is taken too, `node run.mjs start` finds the next free port itself and
writes it into `.env` — into `DB_PORT` **and** into `DATABASE_URL`, because the
two have to match:

```bash
DB_PORT=15433
DATABASE_URL=postgresql://app:app@localhost:15433/app
```

You can change that by hand at any time; all that matters is moving both lines
together. If they do not match, `node run.mjs start` aborts with an explanation
**before** migrations end up in a foreign database (`scripts/db/up.mjs`). This
mix-up is the most common and most unpleasant local mistake — projects from this
template all use the same credentials `app/app/app`, so they accidentally fit
each other.
