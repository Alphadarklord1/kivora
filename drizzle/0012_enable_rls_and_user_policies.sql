CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.users
  WHERE supabase_auth_id = auth.uid()::text
  LIMIT 1
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.current_app_user_id() FROM public;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO authenticated;
--> statement-breakpoint
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.library_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.recent_files ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.rag_file_indexes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.study_plans ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.srs_decks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.srs_preferences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.srs_review_history ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.verification_tokens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own ON public.users
FOR SELECT TO authenticated
USING (id = public.current_app_user_id());
--> statement-breakpoint
DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own ON public.users
FOR UPDATE TO authenticated
USING (id = public.current_app_user_id())
WITH CHECK (id = public.current_app_user_id());
--> statement-breakpoint
DROP POLICY IF EXISTS user_settings_own_all ON public.user_settings;
CREATE POLICY user_settings_own_all ON public.user_settings
FOR ALL TO authenticated
USING (user_id = public.current_app_user_id())
WITH CHECK (user_id = public.current_app_user_id());
--> statement-breakpoint
DROP POLICY IF EXISTS folders_own_all ON public.folders;
CREATE POLICY folders_own_all ON public.folders
FOR ALL TO authenticated
USING (user_id = public.current_app_user_id())
WITH CHECK (user_id = public.current_app_user_id());
--> statement-breakpoint
DROP POLICY IF EXISTS topics_via_folder_all ON public.topics;
CREATE POLICY topics_via_folder_all ON public.topics
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.folders f
    WHERE f.id = topics.folder_id
      AND f.user_id = public.current_app_user_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.folders f
    WHERE f.id = topics.folder_id
      AND f.user_id = public.current_app_user_id()
  )
);
--> statement-breakpoint
DROP POLICY IF EXISTS files_own_all ON public.files;
CREATE POLICY files_own_all ON public.files
FOR ALL TO authenticated
USING (user_id = public.current_app_user_id())
WITH CHECK (user_id = public.current_app_user_id());
--> statement-breakpoint
DROP POLICY IF EXISTS library_items_own_all ON public.library_items;
CREATE POLICY library_items_own_all ON public.library_items
FOR ALL TO authenticated
USING (user_id = public.current_app_user_id())
WITH CHECK (user_id = public.current_app_user_id());
--> statement-breakpoint
DROP POLICY IF EXISTS recent_files_own_all ON public.recent_files;
CREATE POLICY recent_files_own_all ON public.recent_files
FOR ALL TO authenticated
USING (user_id = public.current_app_user_id())
WITH CHECK (user_id = public.current_app_user_id());
--> statement-breakpoint
DROP POLICY IF EXISTS rag_file_indexes_own_all ON public.rag_file_indexes;
CREATE POLICY rag_file_indexes_own_all ON public.rag_file_indexes
FOR ALL TO authenticated
USING (user_id = public.current_app_user_id())
WITH CHECK (user_id = public.current_app_user_id());
--> statement-breakpoint
DROP POLICY IF EXISTS study_plans_own_all ON public.study_plans;
CREATE POLICY study_plans_own_all ON public.study_plans
FOR ALL TO authenticated
USING (user_id = public.current_app_user_id())
WITH CHECK (user_id = public.current_app_user_id());
--> statement-breakpoint
DROP POLICY IF EXISTS calendar_events_own_all ON public.calendar_events;
CREATE POLICY calendar_events_own_all ON public.calendar_events
FOR ALL TO authenticated
USING (user_id = public.current_app_user_id())
WITH CHECK (user_id = public.current_app_user_id());
--> statement-breakpoint
DROP POLICY IF EXISTS quiz_attempts_own_all ON public.quiz_attempts;
CREATE POLICY quiz_attempts_own_all ON public.quiz_attempts
FOR ALL TO authenticated
USING (user_id = public.current_app_user_id())
WITH CHECK (user_id = public.current_app_user_id());
--> statement-breakpoint
DROP POLICY IF EXISTS study_sessions_own_all ON public.study_sessions;
CREATE POLICY study_sessions_own_all ON public.study_sessions
FOR ALL TO authenticated
USING (user_id = public.current_app_user_id())
WITH CHECK (user_id = public.current_app_user_id());
--> statement-breakpoint
DROP POLICY IF EXISTS srs_decks_own_all ON public.srs_decks;
CREATE POLICY srs_decks_own_all ON public.srs_decks
FOR ALL TO authenticated
USING (user_id = public.current_app_user_id())
WITH CHECK (user_id = public.current_app_user_id());
--> statement-breakpoint
DROP POLICY IF EXISTS srs_preferences_own_all ON public.srs_preferences;
CREATE POLICY srs_preferences_own_all ON public.srs_preferences
FOR ALL TO authenticated
USING (user_id = public.current_app_user_id())
WITH CHECK (user_id = public.current_app_user_id());
--> statement-breakpoint
DROP POLICY IF EXISTS srs_review_history_own_all ON public.srs_review_history;
CREATE POLICY srs_review_history_own_all ON public.srs_review_history
FOR ALL TO authenticated
USING (user_id = public.current_app_user_id())
WITH CHECK (user_id = public.current_app_user_id());
--> statement-breakpoint
DROP POLICY IF EXISTS shares_select_owner_or_recipient ON public.shares;
CREATE POLICY shares_select_owner_or_recipient ON public.shares
FOR SELECT TO authenticated
USING (
  owner_id = public.current_app_user_id()
  OR shared_with_user_id = public.current_app_user_id()
);
--> statement-breakpoint
DROP POLICY IF EXISTS shares_insert_owner_only ON public.shares;
CREATE POLICY shares_insert_owner_only ON public.shares
FOR INSERT TO authenticated
WITH CHECK (owner_id = public.current_app_user_id());
--> statement-breakpoint
DROP POLICY IF EXISTS shares_update_owner_only ON public.shares;
CREATE POLICY shares_update_owner_only ON public.shares
FOR UPDATE TO authenticated
USING (owner_id = public.current_app_user_id())
WITH CHECK (owner_id = public.current_app_user_id());
--> statement-breakpoint
DROP POLICY IF EXISTS shares_delete_owner_only ON public.shares;
CREATE POLICY shares_delete_owner_only ON public.shares
FOR DELETE TO authenticated
USING (owner_id = public.current_app_user_id());
