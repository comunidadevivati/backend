CREATE TYPE "forms"."email_dispatch_status" AS ENUM('SENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "forms"."invitation_status" AS ENUM('PENDING', 'ANSWERED');--> statement-breakpoint
CREATE TABLE "forms"."form_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"form_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_email" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" "forms"."invitation_status" DEFAULT 'PENDING' NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"answered_at" timestamp with time zone,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "form_invitations_form_account_key" UNIQUE("form_id","account_id")
);
--> statement-breakpoint
ALTER TABLE "forms"."forms" ADD COLUMN "email_dispatch_id" uuid;--> statement-breakpoint
ALTER TABLE "forms"."forms" ADD COLUMN "email_dispatch_status" "forms"."email_dispatch_status";--> statement-breakpoint
ALTER TABLE "forms"."forms" ADD COLUMN "email_dispatch_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "forms"."forms" ADD COLUMN "email_dispatch_finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "forms"."forms" ADD COLUMN "email_dispatch_sent_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "forms"."forms" ADD COLUMN "email_dispatch_failed_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "forms"."form_invitations" ADD CONSTRAINT "form_invitations_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "forms"."forms"("id") ON DELETE cascade ON UPDATE no action;