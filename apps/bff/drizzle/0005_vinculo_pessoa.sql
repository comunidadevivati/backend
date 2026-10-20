ALTER TABLE "auth"."users" ADD COLUMN "person_id" uuid;--> statement-breakpoint
ALTER TABLE "auth"."users" ADD CONSTRAINT "users_person_id_unique" UNIQUE("person_id");