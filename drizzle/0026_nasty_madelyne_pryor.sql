-- Reviewed by hand before it was applied. Two things worth knowing:
--
-- 1. `token_ledger_account` is DROPPED and replaced by a wider index leading
--    with the same column, so nothing loses coverage — the ledger read is
--    "this account, newest first" and now gets its order from the index
--    instead of sorting afterwards.
-- 2. These are plain CREATE INDEX, not CONCURRENTLY. drizzle-kit runs a
--    migration inside a transaction and Postgres refuses CONCURRENTLY there.
--    On a large live `ai_usage` this takes a write lock for the length of the
--    build; on a table that has been pruned to a year it is seconds. If you
--    are applying this to a table with millions of rows, run the two
--    `ai_usage` indexes by hand with CONCURRENTLY first. Those two carry
--    IF NOT EXISTS (added here, drizzle does not emit it) precisely so that
--    escape hatch works — without it the migration would fail on the index
--    you had just built correctly.
CREATE TABLE "cron_runs" (
	"job" text PRIMARY KEY NOT NULL,
	"locked_at" timestamp,
	"last_started_at" timestamp,
	"last_finished_at" timestamp,
	"last_outcome" text,
	"last_detail" text,
	"runs" integer DEFAULT 0 NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DROP INDEX "token_ledger_account";--> statement-breakpoint
CREATE INDEX "orders_created" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "token_ledger_account_created" ON "token_ledger" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "grants_member_product" ON "grants" USING btree ("member_id","product_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_provider_model_created" ON "ai_usage" USING btree ("provider","model","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_outcome_created" ON "ai_usage" USING btree ("outcome","created_at");