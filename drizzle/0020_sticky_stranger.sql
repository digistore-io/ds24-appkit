CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"ds24_order_id" text NOT NULL,
	"ds24_transaction_id" text NOT NULL,
	"invoice_url" text NOT NULL,
	"amount" numeric(12, 2),
	"currency" text,
	"pay_sequence_no" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_ds24_transaction_id_unique" UNIQUE("ds24_transaction_id")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "rebilling_stop_url" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "renew_url" text;--> statement-breakpoint
CREATE INDEX "invoices_order" ON "invoices" USING btree ("ds24_order_id");