CREATE TABLE IF NOT EXISTS "study_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "description" text,
  "join_code" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "study_groups_join_code_uq" ON "study_groups" ("join_code");

CREATE TABLE IF NOT EXISTS "study_group_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL REFERENCES "study_groups"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "role" text DEFAULT 'member' NOT NULL,
  "joined_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "study_group_members_group_user_uq"
  ON "study_group_members" ("group_id", "user_id");

CREATE INDEX IF NOT EXISTS "study_group_members_user_idx"
  ON "study_group_members" ("user_id");

CREATE TABLE IF NOT EXISTS "study_group_decks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL REFERENCES "study_groups"("id") ON DELETE cascade,
  "deck_name" text NOT NULL,
  "card_count" integer DEFAULT 0 NOT NULL,
  "content" text NOT NULL,
  "share_token" text,
  "added_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "added_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "study_group_decks_group_idx"
  ON "study_group_decks" ("group_id");

CREATE INDEX IF NOT EXISTS "study_group_decks_added_by_idx"
  ON "study_group_decks" ("added_by");
