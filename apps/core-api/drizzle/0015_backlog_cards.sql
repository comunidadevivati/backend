CREATE SCHEMA "backlog";
--> statement-breakpoint
CREATE TYPE "backlog"."card_status" AS ENUM('CREATED', 'PRIORITIZED', 'REFINED', 'IN_PROGRESS', 'TESTING', 'HOMOLOGATED', 'DONE', 'DEPLOYED');--> statement-breakpoint
CREATE TYPE "backlog"."card_type" AS ENUM('FEATURE', 'BUG', 'ADJUSTMENT');--> statement-breakpoint
CREATE TABLE "backlog"."cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" "backlog"."card_type" NOT NULL,
	"status" "backlog"."card_status" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"status_changed_at" timestamp with time zone NOT NULL
);
