CREATE SCHEMA "organization";
--> statement-breakpoint
CREATE TYPE "organization"."congregation_status" AS ENUM('DRAFT', 'ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "organization"."organization_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TABLE "organization"."congregations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"cnpj" text,
	"street" text NOT NULL,
	"number" text NOT NULL,
	"complement" text,
	"district" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"postal_code" text NOT NULL,
	"phone" text,
	"email" text,
	"headquarters" boolean DEFAULT false NOT NULL,
	"status" "organization"."congregation_status" DEFAULT 'DRAFT' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization"."organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"legal_name" text NOT NULL,
	"trade_name" text NOT NULL,
	"cnpj" text NOT NULL,
	"street" text NOT NULL,
	"number" text NOT NULL,
	"complement" text,
	"district" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"postal_code" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"status" "organization"."organization_status" DEFAULT 'ACTIVE' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_cnpj_unique" UNIQUE("cnpj")
);
--> statement-breakpoint
ALTER TABLE "organization"."congregations" ADD CONSTRAINT "congregations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "congregations_code_uidx" ON "organization"."congregations" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "congregations_headquarters_uidx" ON "organization"."congregations" USING btree ("organization_id") WHERE "organization"."congregations"."headquarters";--> statement-breakpoint
CREATE INDEX "congregations_organization_id_idx" ON "organization"."congregations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "congregations_status_idx" ON "organization"."congregations" USING btree ("status");