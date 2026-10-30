CREATE TABLE "forms"."form_anonymous_responses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"form_id" uuid NOT NULL,
	"answers" jsonb NOT NULL,
	"submitted_on" date NOT NULL
);
--> statement-breakpoint
ALTER TABLE "forms"."forms" ADD COLUMN "anonymous" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "forms"."forms" ADD COLUMN "allow_answer_edit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "forms"."forms" ADD COLUMN "consent_text" text;--> statement-breakpoint
ALTER TABLE "forms"."form_anonymous_responses" ADD CONSTRAINT "form_anonymous_responses_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "forms"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_anonymous_responses_form_id_idx" ON "forms"."form_anonymous_responses" USING btree ("form_id");