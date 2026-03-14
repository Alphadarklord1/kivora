CREATE TABLE IF NOT EXISTS "srs_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "daily_goal" integer NOT NULL DEFAULT 20,
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "srs_preferences_user_id_uq"
  ON "srs_preferences" ("user_id");

CREATE TABLE IF NOT EXISTS "srs_review_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "deck_id" text NOT NULL,
  "card_id" text NOT NULL,
  "grade" integer NOT NULL,
  "correct" boolean NOT NULL DEFAULT false,
  "reviewed_at" timestamp NOT NULL DEFAULT now(),
  "next_review" text NOT NULL,
  "interval" integer NOT NULL DEFAULT 1,
  "elapsed_days" integer NOT NULL DEFAULT 0,
  "stability" integer,
  "difficulty" integer
);

CREATE INDEX IF NOT EXISTS "srs_review_history_user_reviewed_idx"
  ON "srs_review_history" ("user_id", "reviewed_at" DESC);

CREATE INDEX IF NOT EXISTS "srs_review_history_user_deck_idx"
  ON "srs_review_history" ("user_id", "deck_id");
