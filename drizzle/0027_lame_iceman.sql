CREATE TABLE "impersonations" (
	"id" text PRIMARY KEY NOT NULL,
	"operator_id" text,
	"member_id" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"ended_by" text
);
--> statement-breakpoint
ALTER TABLE "impersonations" ADD CONSTRAINT "impersonations_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impersonations" ADD CONSTRAINT "impersonations_member_id_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "impersonations_started_at_idx" ON "impersonations" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "impersonations_member_idx" ON "impersonations" USING btree ("member_id","started_at");--> statement-breakpoint
CREATE INDEX "impersonations_open_idx" ON "impersonations" USING btree ("ended_at","expires_at");