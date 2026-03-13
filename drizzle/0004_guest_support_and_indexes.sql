ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guest_session_id text;

CREATE UNIQUE INDEX IF NOT EXISTS users_guest_session_id_uq
  ON users (guest_session_id)
  WHERE guest_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS folders_user_id_idx ON folders (user_id);
CREATE INDEX IF NOT EXISTS topics_folder_id_idx ON topics (folder_id);
CREATE INDEX IF NOT EXISTS files_user_id_idx ON files (user_id);
CREATE INDEX IF NOT EXISTS files_folder_id_idx ON files (folder_id);
CREATE INDEX IF NOT EXISTS files_topic_id_idx ON files (topic_id);
CREATE INDEX IF NOT EXISTS library_items_user_id_idx ON library_items (user_id);
CREATE INDEX IF NOT EXISTS recent_files_user_id_idx ON recent_files (user_id);
CREATE INDEX IF NOT EXISTS recent_files_file_id_idx ON recent_files (file_id);
CREATE INDEX IF NOT EXISTS shares_owner_id_idx ON shares (owner_id);
CREATE INDEX IF NOT EXISTS shares_share_token_idx ON shares (share_token);
CREATE INDEX IF NOT EXISTS shares_shared_with_user_id_idx ON shares (shared_with_user_id);
CREATE INDEX IF NOT EXISTS quiz_attempts_user_id_idx ON quiz_attempts (user_id);
CREATE INDEX IF NOT EXISTS quiz_attempts_file_id_idx ON quiz_attempts (file_id);
CREATE INDEX IF NOT EXISTS study_plans_user_id_idx ON study_plans (user_id);
CREATE INDEX IF NOT EXISTS study_plans_folder_id_idx ON study_plans (folder_id);
CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts (user_id);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
