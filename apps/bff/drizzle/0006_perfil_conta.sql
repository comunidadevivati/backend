CREATE TABLE "auth"."email_change_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"new_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "auth"."users" ADD COLUMN "news_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."users" ADD COLUMN "news_opt_in_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth"."email_change_tokens" ADD CONSTRAINT "email_change_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_change_tokens_token_hash_uidx" ON "auth"."email_change_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "email_change_tokens_user_id_idx" ON "auth"."email_change_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_change_tokens_expires_at_idx" ON "auth"."email_change_tokens" USING btree ("expires_at");