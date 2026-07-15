CREATE TYPE "public"."subscription_status" AS ENUM('active', 'paused', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."token_ledger_type" AS ENUM('topup', 'consume', 'refund', 'adjust');--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ds24_purchase_id" text NOT NULL,
	"ds24_order_id" text,
	"ds24_product_id" text,
	"buyer_email" text,
	"status" "subscription_status" NOT NULL,
	"billing_interval" text,
	"amount" numeric(12, 2),
	"currency" text,
	"renew_url" text,
	"rebilling_stop_url" text,
	"invoice_url" text,
	"support_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_vendor_purchase" UNIQUE("user_id","ds24_purchase_id")
);
--> statement-breakpoint
CREATE TABLE "token_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"buyer_email" text NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"auto_reload_enabled" boolean DEFAULT false NOT NULL,
	"auto_reload_threshold" integer DEFAULT 0 NOT NULL,
	"auto_reload_package_key" text,
	"ds24_purchase_id" text,
	"reload_locked_at" timestamp,
	"last_reload_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "token_accounts_vendor_email" UNIQUE("user_id","buyer_email")
);
--> statement-breakpoint
CREATE TABLE "token_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"type" "token_ledger_type" NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"ds24_order_id" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "token_ledger_topup_order" UNIQUE("account_id","ds24_order_id")
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_accounts" ADD CONSTRAINT "token_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_ledger" ADD CONSTRAINT "token_ledger_account_id_token_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."token_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_vendor_email" ON "subscriptions" USING btree ("user_id","buyer_email");--> statement-breakpoint
CREATE INDEX "token_ledger_account" ON "token_ledger" USING btree ("account_id");