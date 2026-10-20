CREATE SCHEMA "members";
--> statement-breakpoint
CREATE TYPE "members"."member_status" AS ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "members"."membership_status" AS ENUM('PENDING', 'ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TABLE "members"."members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"status" "members"."member_status" DEFAULT 'ACTIVE' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_person_id_unique" UNIQUE("person_id")
);
--> statement-breakpoint
CREATE TABLE "members"."memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"member_id" uuid NOT NULL,
	"congregation_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" "members"."membership_status" DEFAULT 'PENDING' NOT NULL,
	"started_on" date,
	"ended_on" date,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members"."people" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"birth_date" date,
	"phone" text,
	"email" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
ALTER TABLE "members"."members" ADD CONSTRAINT "members_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "members"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members"."memberships" ADD CONSTRAINT "memberships_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "members"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "members_status_idx" ON "members"."members" USING btree ("status");--> statement-breakpoint
CREATE INDEX "memberships_member_id_idx" ON "members"."memberships" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "memberships_congregation_id_idx" ON "members"."memberships" USING btree ("congregation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_open_uidx" ON "members"."memberships" USING btree ("member_id","congregation_id") WHERE "members"."memberships"."status" in ('PENDING', 'ACTIVE');--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_active_primary_uidx" ON "members"."memberships" USING btree ("member_id") WHERE "members"."memberships"."is_primary" and "members"."memberships"."status" = 'ACTIVE';