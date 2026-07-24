ALTER TABLE "buy_url_cache" DROP CONSTRAINT "buy_url_cache_user_offer";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_vendor_purchase";--> statement-breakpoint
ALTER TABLE "buy_url_cache" DROP CONSTRAINT "buy_url_cache_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "token_accounts" DROP CONSTRAINT "token_accounts_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "subscriptions_vendor_email";--> statement-breakpoint
CREATE INDEX "subscriptions_email" ON "subscriptions" USING btree ("buyer_email");--> statement-breakpoint
ALTER TABLE "buy_url_cache" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "token_accounts" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "token_accounts" DROP COLUMN "buyer_email";--> statement-breakpoint
ALTER TABLE "buy_url_cache" ADD CONSTRAINT "buy_url_cache_offer" UNIQUE("offer_key");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_purchase" UNIQUE("ds24_purchase_id");