ALTER TABLE "quiz_attempts"
  ADD COLUMN IF NOT EXISTS "deck_id" text;

CREATE INDEX IF NOT EXISTS "quiz_attempts_user_deck_created_idx"
  ON "quiz_attempts" ("user_id", "deck_id", "created_at" DESC);
