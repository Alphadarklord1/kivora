ALTER TABLE "study_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "study_group_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "study_group_decks" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'study_groups' AND policyname = 'study_groups_select_member_or_owner'
  ) THEN
    CREATE POLICY "study_groups_select_member_or_owner" ON "study_groups"
      FOR SELECT
      USING (
        owner_id = public.current_app_user_id()
        OR EXISTS (
          SELECT 1 FROM public.study_group_members gm
          WHERE gm.group_id = study_groups.id
            AND gm.user_id = public.current_app_user_id()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'study_groups' AND policyname = 'study_groups_insert_owner'
  ) THEN
    CREATE POLICY "study_groups_insert_owner" ON "study_groups"
      FOR INSERT
      WITH CHECK (owner_id = public.current_app_user_id());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'study_groups' AND policyname = 'study_groups_update_owner'
  ) THEN
    CREATE POLICY "study_groups_update_owner" ON "study_groups"
      FOR UPDATE
      USING (owner_id = public.current_app_user_id())
      WITH CHECK (owner_id = public.current_app_user_id());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'study_groups' AND policyname = 'study_groups_delete_owner'
  ) THEN
    CREATE POLICY "study_groups_delete_owner" ON "study_groups"
      FOR DELETE
      USING (owner_id = public.current_app_user_id());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'study_group_members' AND policyname = 'study_group_members_select_visible_group'
  ) THEN
    CREATE POLICY "study_group_members_select_visible_group" ON "study_group_members"
      FOR SELECT
      USING (
        user_id = public.current_app_user_id()
        OR EXISTS (
          SELECT 1 FROM public.study_group_members gm
          WHERE gm.group_id = study_group_members.group_id
            AND gm.user_id = public.current_app_user_id()
        )
        OR EXISTS (
          SELECT 1 FROM public.study_groups g
          WHERE g.id = study_group_members.group_id
            AND g.owner_id = public.current_app_user_id()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'study_group_members' AND policyname = 'study_group_members_insert_self_or_owner'
  ) THEN
    CREATE POLICY "study_group_members_insert_self_or_owner" ON "study_group_members"
      FOR INSERT
      WITH CHECK (
        user_id = public.current_app_user_id()
        OR EXISTS (
          SELECT 1 FROM public.study_groups g
          WHERE g.id = study_group_members.group_id
            AND g.owner_id = public.current_app_user_id()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'study_group_members' AND policyname = 'study_group_members_delete_self_or_owner'
  ) THEN
    CREATE POLICY "study_group_members_delete_self_or_owner" ON "study_group_members"
      FOR DELETE
      USING (
        user_id = public.current_app_user_id()
        OR EXISTS (
          SELECT 1 FROM public.study_groups g
          WHERE g.id = study_group_members.group_id
            AND g.owner_id = public.current_app_user_id()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'study_group_decks' AND policyname = 'study_group_decks_select_member'
  ) THEN
    CREATE POLICY "study_group_decks_select_member" ON "study_group_decks"
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.study_group_members gm
          WHERE gm.group_id = study_group_decks.group_id
            AND gm.user_id = public.current_app_user_id()
        )
        OR EXISTS (
          SELECT 1 FROM public.study_groups g
          WHERE g.id = study_group_decks.group_id
            AND g.owner_id = public.current_app_user_id()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'study_group_decks' AND policyname = 'study_group_decks_insert_member'
  ) THEN
    CREATE POLICY "study_group_decks_insert_member" ON "study_group_decks"
      FOR INSERT
      WITH CHECK (
        added_by = public.current_app_user_id()
        AND (
          EXISTS (
            SELECT 1 FROM public.study_group_members gm
            WHERE gm.group_id = study_group_decks.group_id
              AND gm.user_id = public.current_app_user_id()
          )
          OR EXISTS (
            SELECT 1 FROM public.study_groups g
            WHERE g.id = study_group_decks.group_id
              AND g.owner_id = public.current_app_user_id()
          )
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'study_group_decks' AND policyname = 'study_group_decks_delete_owner_or_adder'
  ) THEN
    CREATE POLICY "study_group_decks_delete_owner_or_adder" ON "study_group_decks"
      FOR DELETE
      USING (
        added_by = public.current_app_user_id()
        OR EXISTS (
          SELECT 1 FROM public.study_groups g
          WHERE g.id = study_group_decks.group_id
            AND g.owner_id = public.current_app_user_id()
        )
      );
  END IF;
END $$;
