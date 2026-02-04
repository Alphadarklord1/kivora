-- Add blind index columns for encrypted searchable fields

-- Folders: add nameIndex for searching encrypted folder names
ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "name_index" text;

-- Topics: add nameIndex for searching encrypted topic names
ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "name_index" text;

-- Files: add nameIndex for searching encrypted file names
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "name_index" text;

-- Library items: add contentIndex for searching encrypted content
ALTER TABLE "library_items" ADD COLUMN IF NOT EXISTS "content_index" text;

-- Create indexes for efficient searching on blind indexes
CREATE INDEX IF NOT EXISTS "folders_name_index_idx" ON "folders" ("name_index");
CREATE INDEX IF NOT EXISTS "topics_name_index_idx" ON "topics" ("name_index");
CREATE INDEX IF NOT EXISTS "files_name_index_idx" ON "files" ("name_index");
CREATE INDEX IF NOT EXISTS "library_items_content_index_idx" ON "library_items" ("content_index");
