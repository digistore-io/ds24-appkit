CREATE TYPE "public"."ipn_result" AS ENUM('accepted', 'invalid_signature', 'connection_test', 'not_configured', 'error');--> statement-breakpoint
CREATE TABLE "ipn_events" (
	"id" text PRIMARY KEY NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"event" text,
	"ds24_order_id" text,
	"ds24_purchase_id" text,
	"signature_valid" boolean NOT NULL,
	"result" "ipn_result" NOT NULL,
	"detail" text
);
--> statement-breakpoint
CREATE INDEX "ipn_events_received" ON "ipn_events" USING btree ("received_at");