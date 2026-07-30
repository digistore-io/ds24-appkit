CREATE TYPE "public"."media_kind" AS ENUM('image', 'video', 'audio', 'file');--> statement-breakpoint
CREATE TYPE "public"."media_source" AS ENUM('upload', 'generated');--> statement-breakpoint
CREATE TYPE "public"."media_visibility" AS ENUM('public', 'owner', 'entitled');--> statement-breakpoint
CREATE TABLE "media" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text,
	"kind" "media_kind" NOT NULL,
	"visibility" "media_visibility" DEFAULT 'owner' NOT NULL,
	"requires_plan" text,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"filename" text,
	"bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"duration_seconds" integer,
	"sha256" text NOT NULL,
	"source" "media_source" DEFAULT 'upload' NOT NULL,
	"alt" text,
	"prompt" text,
	"provider" text,
	"model" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "media_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_owner" ON "media" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "media_requires_plan" ON "media" USING btree ("requires_plan");