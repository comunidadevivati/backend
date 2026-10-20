CREATE SCHEMA "gallery";
--> statement-breakpoint
CREATE TYPE "gallery"."album_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "gallery"."photo_failure" AS ENUM('invalid_image', 'processing_error');--> statement-breakpoint
CREATE TYPE "gallery"."photo_status" AS ENUM('PENDING_UPLOAD', 'PROCESSING', 'READY', 'FAILED');--> statement-breakpoint
CREATE TABLE "gallery"."albums" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"occurred_on" date NOT NULL,
	"cover_photo_id" uuid,
	"status" "gallery"."album_status" DEFAULT 'DRAFT' NOT NULL,
	"published_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "albums_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "gallery"."photos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"album_id" uuid NOT NULL,
	"status" "gallery"."photo_status" DEFAULT 'PENDING_UPLOAD' NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"placeholder" text,
	"variant_widths" integer[] DEFAULT '{}' NOT NULL,
	"failure" "gallery"."photo_failure",
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gallery"."photos" ADD CONSTRAINT "photos_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "gallery"."albums"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "albums_occurred_on_id_idx" ON "gallery"."albums" USING btree ("occurred_on","id");--> statement-breakpoint
CREATE INDEX "photos_album_id_id_idx" ON "gallery"."photos" USING btree ("album_id","id");--> statement-breakpoint
CREATE INDEX "photos_status_idx" ON "gallery"."photos" USING btree ("status");