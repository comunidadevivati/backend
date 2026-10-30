ALTER TABLE "forms"."form_invitations" ADD COLUMN "email_message_id" text;--> statement-breakpoint
ALTER TABLE "forms"."form_invitations" ADD COLUMN "delivery_status" text;--> statement-breakpoint
ALTER TABLE "forms"."form_invitations" ADD COLUMN "delivery_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "forms"."forms" ADD COLUMN "email_dispatch_kind" text;--> statement-breakpoint
ALTER TABLE "forms"."forms" ADD COLUMN "answers_purged_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "form_invitations_email_message_id_idx" ON "forms"."form_invitations" USING btree ("email_message_id");