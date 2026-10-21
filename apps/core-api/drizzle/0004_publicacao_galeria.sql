ALTER TABLE "gallery"."photos" ADD COLUMN "publication_key" text;--> statement-breakpoint
ALTER TABLE "gallery"."photos" ADD COLUMN "published_at" timestamp with time zone;