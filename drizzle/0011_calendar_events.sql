CREATE TABLE IF NOT EXISTS "calendar_events" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL,
  "title" text NOT NULL,
  "type" text NOT NULL,
  "date" text NOT NULL,
  "start_time" text NOT NULL,
  "end_time" text NOT NULL,
  "description" text,
  "plan_id" uuid,
  "completed" boolean DEFAULT false,
  "color" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_plan_id_study_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."study_plans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_events_user_date_idx" ON "calendar_events" USING btree ("user_id","date" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_events_plan_idx" ON "calendar_events" USING btree ("plan_id");
