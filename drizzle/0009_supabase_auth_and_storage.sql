ALTER TABLE users ADD COLUMN IF NOT EXISTS supabase_auth_id text;
CREATE UNIQUE INDEX IF NOT EXISTS users_supabase_auth_id_uq ON users (supabase_auth_id);

ALTER TABLE files ADD COLUMN IF NOT EXISTS storage_provider text;
ALTER TABLE files ADD COLUMN IF NOT EXISTS storage_bucket text;
ALTER TABLE files ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE files ADD COLUMN IF NOT EXISTS storage_uploaded_at timestamp;
