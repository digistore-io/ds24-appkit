CREATE TYPE "public"."grant_source" AS ENUM('purchase', 'manual');--> statement-breakpoint
CREATE TABLE "grants" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"product_key" text NOT NULL,
	"source" "grant_source" NOT NULL,
	"ds24_purchase_id" text,
	"issued_by" text,
	"note" text,
	"access_until" timestamp,
	"suspended_at" timestamp,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "member_id" text;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_member_id_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "grants_purchase_product" ON "grants" USING btree ("ds24_purchase_id","product_key") WHERE "grants"."ds24_purchase_id" is not null;--> statement-breakpoint
CREATE INDEX "grants_member" ON "grants" USING btree ("member_id");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_member_id_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_member" ON "subscriptions" USING btree ("member_id");--> statement-breakpoint
--
-- Hand-added: every grant must say where it came from.
--
-- Drizzle's DSL does not express CHECK constraints, so this is written here by
-- hand — as migration 0011 does for its partial expression index.
--
-- NOT written the way the acceptance criterion reads. Literally
--   CHECK (ds24_purchase_id IS NOT NULL OR issued_by IS NOT NULL)
-- would make deleting an Operator IMPOSSIBLE: issued_by is `set null`, so the
-- delete nulls the only column satisfying the CHECK and the whole transaction
-- aborts. The Operator who issued a grant is HISTORY, not provenance.
--
-- Constrained on `source` instead, which never changes for the life of a row.
-- That is strictly stronger than the AC — it also forbids a manual grant
-- CLAIMING a purchase it never came from — and it survives the delete.
ALTER TABLE "grants" ADD CONSTRAINT "grants_provenance" CHECK (
  ("source" = 'purchase' AND "ds24_purchase_id" IS NOT NULL) OR
  ("source" = 'manual'   AND "ds24_purchase_id" IS NULL)
);--> statement-breakpoint
--
-- Hand-added backfill for subscriptions.member_id.
--
-- Taken from `orders` — Epic 1's STRONG attribution, already computed and
-- already fill-only. Deliberately NOT re-derived from buyer_email: that is the
-- weak identity this column exists to replace, and doing it here would
-- reintroduce it under a new name.
--
-- Without the backfill the column stays NULL for every existing subscription
-- forever: Digistore24 does not redeliver an event it already acknowledged, and
-- AD-8 rules out a reconciliation job. Nothing would ever come back to fix it.
--
-- DISTINCT ON (oldest order per purchase) rather than a bare join, following
-- migration 0008: several orders share one purchase id once a subscription
-- rebills, and a plain UPDATE ... FROM would pick among them arbitrarily.
UPDATE "subscriptions" s SET "member_id" = m.member_id
FROM (
  SELECT DISTINCT ON (o."ds24_purchase_id")
         o."ds24_purchase_id" AS purchase_id, o."member_id" AS member_id
  FROM "orders" o
  WHERE o."member_id" IS NOT NULL AND o."ds24_purchase_id" IS NOT NULL
  ORDER BY o."ds24_purchase_id", o."created_at" ASC
) m
WHERE s."ds24_purchase_id" = m.purchase_id
  AND s."member_id" IS NULL;