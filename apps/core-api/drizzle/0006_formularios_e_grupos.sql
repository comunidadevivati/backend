CREATE SCHEMA "communication";
--> statement-breakpoint
CREATE SCHEMA "forms";
--> statement-breakpoint
CREATE TYPE "forms"."form_status" AS ENUM('DRAFT', 'PUBLISHED', 'FINISHED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "communication"."email_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"member_account_ids" uuid[] DEFAULT '{}' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forms"."forms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"department" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"status" "forms"."form_status" DEFAULT 'DRAFT' NOT NULL,
	"questions" jsonb NOT NULL,
	"recipient_group_ids" uuid[] DEFAULT '{}' NOT NULL,
	"header_image_key" text,
	"header_image_width" integer,
	"header_image_height" integer,
	"header_image_content_type" text,
	"header_image_byte_size" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "email_groups_name_key" ON "communication"."email_groups" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "forms_department_id_idx" ON "forms"."forms" USING btree ("department","id");