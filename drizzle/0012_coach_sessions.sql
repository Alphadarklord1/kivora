-- Scholar Hub persistence: research projects, reports, and grading history.
-- One table, typed by `kind`, with the full session state in a JSONB payload.

CREATE TABLE IF NOT EXISTS "coach_sessions" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"    uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind"       text NOT NULL,           -- 'research' | 'report' | 'grade'
  "title"      text NOT NULL,
  "payload"    jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- List queries are always scoped to a user and ordered by recency; this
-- index makes "show me my last 20 research sessions" cheap.
CREATE INDEX IF NOT EXISTS "coach_sessions_user_kind_recent_idx"
  ON "coach_sessions" ("user_id", "kind", "updated_at" DESC);
