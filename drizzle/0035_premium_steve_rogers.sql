CREATE TYPE "public"."api_key_audience" AS ENUM('mcp', 'api');--> statement-breakpoint
ALTER TABLE "mcp_keys" RENAME TO "api_keys";--> statement-breakpoint
ALTER TABLE "api_keys" DROP CONSTRAINT "mcp_keys_token_hash_unique";--> statement-breakpoint
ALTER TABLE "api_keys" DROP CONSTRAINT "mcp_keys_member_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "mcp_keys_member";--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "audience" "api_key_audience" DEFAULT 'mcp' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_member_id_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_member" ON "api_keys" USING btree ("member_id","created_at");--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_token_hash_unique" UNIQUE("token_hash");