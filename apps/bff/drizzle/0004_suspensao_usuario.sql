ALTER TABLE "auth"."users" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
-- Contas já suspensas: o momento mais próximo conhecido é a última alteração.
UPDATE "auth"."users" SET "suspended_at" = "updated_at" WHERE "status" = 'SUSPENDED';
