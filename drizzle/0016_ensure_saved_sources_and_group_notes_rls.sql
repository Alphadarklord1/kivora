ALTER TABLE IF EXISTS public.study_group_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.saved_sources ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'study_group_notes'
      AND policyname = 'study_group_notes_select_member'
  ) THEN
    CREATE POLICY "study_group_notes_select_member" ON public.study_group_notes
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.study_group_members gm
          WHERE gm.group_id = study_group_notes.group_id
            AND gm.user_id = public.current_app_user_id()
        )
        OR EXISTS (
          SELECT 1
          FROM public.study_groups g
          WHERE g.id = study_group_notes.group_id
            AND g.owner_id = public.current_app_user_id()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'study_group_notes'
      AND policyname = 'study_group_notes_insert_member'
  ) THEN
    CREATE POLICY "study_group_notes_insert_member" ON public.study_group_notes
      FOR INSERT
      WITH CHECK (
        user_id = public.current_app_user_id()
        AND (
          EXISTS (
            SELECT 1
            FROM public.study_group_members gm
            WHERE gm.group_id = study_group_notes.group_id
              AND gm.user_id = public.current_app_user_id()
          )
          OR EXISTS (
            SELECT 1
            FROM public.study_groups g
            WHERE g.id = study_group_notes.group_id
              AND g.owner_id = public.current_app_user_id()
          )
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'study_group_notes'
      AND policyname = 'study_group_notes_delete_author_or_owner'
  ) THEN
    CREATE POLICY "study_group_notes_delete_author_or_owner" ON public.study_group_notes
      FOR DELETE
      USING (
        user_id = public.current_app_user_id()
        OR EXISTS (
          SELECT 1
          FROM public.study_groups g
          WHERE g.id = study_group_notes.group_id
            AND g.owner_id = public.current_app_user_id()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'saved_sources'
      AND policyname = 'saved_sources_select_own'
  ) THEN
    CREATE POLICY "saved_sources_select_own" ON public.saved_sources
      FOR SELECT
      USING (user_id = public.current_app_user_id());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'saved_sources'
      AND policyname = 'saved_sources_insert_own'
  ) THEN
    CREATE POLICY "saved_sources_insert_own" ON public.saved_sources
      FOR INSERT
      WITH CHECK (user_id = public.current_app_user_id());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'saved_sources'
      AND policyname = 'saved_sources_update_own'
  ) THEN
    CREATE POLICY "saved_sources_update_own" ON public.saved_sources
      FOR UPDATE
      USING (user_id = public.current_app_user_id())
      WITH CHECK (user_id = public.current_app_user_id());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'saved_sources'
      AND policyname = 'saved_sources_delete_own'
  ) THEN
    CREATE POLICY "saved_sources_delete_own" ON public.saved_sources
      FOR DELETE
      USING (user_id = public.current_app_user_id());
  END IF;
END $$;
