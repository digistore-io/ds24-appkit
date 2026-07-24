ALTER TABLE "checkout_intents" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "checkout_intents" CASCADE;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "checkoutToken" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_checkoutToken_unique" UNIQUE("checkoutToken");