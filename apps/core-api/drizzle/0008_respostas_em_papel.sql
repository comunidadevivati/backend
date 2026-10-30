CREATE TYPE "forms"."answer_channel" AS ENUM('DIGITAL', 'PAPER');--> statement-breakpoint
ALTER TABLE "forms"."form_invitations" ADD COLUMN "answer_channel" "forms"."answer_channel";--> statement-breakpoint
ALTER TABLE "forms"."form_invitations" ADD COLUMN "paper_attachment_key" text;--> statement-breakpoint
ALTER TABLE "forms"."form_invitations" ADD COLUMN "paper_attachment_file_name" text;--> statement-breakpoint
ALTER TABLE "forms"."form_invitations" ADD COLUMN "paper_attachment_content_type" text;--> statement-breakpoint
ALTER TABLE "forms"."form_invitations" ADD COLUMN "paper_attachment_byte_size" integer;--> statement-breakpoint
-- Respostas anteriores a esta migration foram todas pelo link.
UPDATE "forms"."form_invitations" SET "answer_channel" = 'DIGITAL' WHERE "status" = 'ANSWERED';