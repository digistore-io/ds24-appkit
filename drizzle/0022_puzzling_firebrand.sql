CREATE TABLE "email_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"memberId" text NOT NULL,
	"newEmail" text NOT NULL,
	"tokenHash" text NOT NULL,
	"requestedAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp NOT NULL,
	CONSTRAINT "email_changes_memberId_unique" UNIQUE("memberId"),
	CONSTRAINT "email_changes_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
ALTER TABLE "email_changes" ADD CONSTRAINT "email_changes_memberId_users_id_fk" FOREIGN KEY ("memberId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;