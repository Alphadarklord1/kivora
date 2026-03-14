CREATE TABLE IF NOT EXISTS "rag_file_indexes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "file_id" uuid NOT NULL REFERENCES "files"("id") ON DELETE CASCADE,
  "signature" text NOT NULL,
  "embedding_version" text NOT NULL,
  "chunk_count" integer NOT NULL DEFAULT 0,
  "index_data" jsonb NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "rag_file_indexes_user_file_uq"
  ON "rag_file_indexes" ("user_id", "file_id");

CREATE INDEX IF NOT EXISTS "rag_file_indexes_user_updated_idx"
  ON "rag_file_indexes" ("user_id", "updated_at" DESC);
