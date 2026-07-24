ALTER TABLE "token_accounts" DROP CONSTRAINT "token_accounts_vendor_email";--> statement-breakpoint
ALTER TABLE "token_accounts" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "token_accounts" ALTER COLUMN "buyer_email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ds24_purchase_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "product_key" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "credits" integer;--> statement-breakpoint
ALTER TABLE "token_accounts" ADD COLUMN "member_id" text;--> statement-breakpoint
ALTER TABLE "token_accounts" ADD CONSTRAINT "token_accounts_member_id_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
--
-- Hand-added backfill. Without it every existing balance keeps member_id NULL,
-- and because UNIQUE defaults to NULLS DISTINCT the app would find no account,
-- hit no conflict, and create a second empty one — leaving the customer's paid
-- balance and their auto-reload mandate permanently unreachable, silently.
--
-- Runs BEFORE the unique constraint below: after it, a duplicate would abort
-- the migration instead of being left for Story 1.8.
--
-- DISTINCT ON picks the oldest account per Member so the constraint cannot
-- collide. Any row left with member_id NULL holds customer money and must be
-- MERGED, never discarded — that is Story 1.8's backfill script.
UPDATE "token_accounts" ta SET "member_id" = m.user_id
FROM (
  SELECT DISTINCT ON (u.id) u.id AS user_id, t.id AS account_id
  FROM "token_accounts" t
  JOIN "users" u ON lower(u.email) = lower(t.buyer_email)
  ORDER BY u.id, t.created_at ASC
) m
WHERE ta.id = m.account_id;--> statement-breakpoint
ALTER TABLE "token_accounts" ADD CONSTRAINT "token_accounts_member" UNIQUE("member_id");