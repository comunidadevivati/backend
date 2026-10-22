CREATE TYPE "members"."person_sex" AS ENUM('MALE', 'FEMALE');--> statement-breakpoint
ALTER TABLE "members"."people" ADD COLUMN "sex" "members"."person_sex";--> statement-breakpoint
ALTER TABLE "members"."people" ADD COLUMN "secondary_phone" text;--> statement-breakpoint
ALTER TABLE "members"."people" ADD COLUMN "secondary_email" text;--> statement-breakpoint
ALTER TABLE "members"."people" ADD COLUMN "address_street" text;--> statement-breakpoint
ALTER TABLE "members"."people" ADD COLUMN "address_number" text;--> statement-breakpoint
ALTER TABLE "members"."people" ADD COLUMN "address_complement" text;--> statement-breakpoint
ALTER TABLE "members"."people" ADD COLUMN "address_district" text;--> statement-breakpoint
ALTER TABLE "members"."people" ADD COLUMN "address_city" text;--> statement-breakpoint
ALTER TABLE "members"."people" ADD COLUMN "address_state" text;--> statement-breakpoint
ALTER TABLE "members"."people" ADD COLUMN "address_postal_code" text;--> statement-breakpoint
ALTER TABLE "members"."people" ADD COLUMN "address_country" text;--> statement-breakpoint
ALTER TABLE "members"."people" ADD COLUMN "address_reference" text;--> statement-breakpoint
ALTER TABLE "members"."people" ADD COLUMN "instagram_url" text;--> statement-breakpoint
ALTER TABLE "members"."people" ADD COLUMN "facebook_url" text;--> statement-breakpoint
ALTER TABLE "members"."people" ADD COLUMN "linkedin_url" text;--> statement-breakpoint
ALTER TABLE "members"."people" ADD COLUMN "twitter_url" text;--> statement-breakpoint
ALTER TABLE "members"."people" ADD COLUMN "youtube_url" text;--> statement-breakpoint
ALTER TABLE "members"."people" ADD COLUMN "avatar_key" text;