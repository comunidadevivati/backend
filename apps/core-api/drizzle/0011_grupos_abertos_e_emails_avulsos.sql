CREATE TYPE "communication"."email_group_type" AS ENUM('RESTRICTED', 'OPEN', 'MIXED');--> statement-breakpoint
ALTER TABLE "forms"."form_invitations" ALTER COLUMN "account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "communication"."email_groups" ADD COLUMN "type" "communication"."email_group_type" DEFAULT 'RESTRICTED' NOT NULL;--> statement-breakpoint
ALTER TABLE "communication"."email_groups" ADD COLUMN "external_emails" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "form_invitations_form_external_email_key" ON "forms"."form_invitations" USING btree ("form_id",lower("recipient_email")) WHERE "forms"."form_invitations"."account_id" is null;