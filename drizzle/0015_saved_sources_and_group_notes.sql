CREATE TABLE IF NOT EXISTS "study_group_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL REFERENCES "study_groups"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "content" text NOT NULL,
  "posted_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "study_group_notes_group_idx"
  ON "study_group_notes" ("group_id");

CREATE TABLE IF NOT EXISTS "saved_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "url" text NOT NULL,
  "authors" text,
  "journal" text,
  "year" integer,
  "doi" text,
  "abstract" text,
  "source_type" text,
  "notes" text,
  "saved_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "saved_sources_user_idx"
  ON "saved_sources" ("user_id");

ALTER TABLE "study_group_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saved_sources" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'study_group_notes' AND policyname = 'study_group_notes_select_member'
  ) THEN
    CREATE POLICY "study_group_notes_select_member" ON "study_group_notes"
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.study_group_members gm
          WHERE gm.group_id = study_group_notes.group_id
            AND gm.user_id = public.current_app_user_id()
        )
        OR EXISTS (
          SELECT 1 FROM public.study_groups g
          WHERE g.id = study_group_notes.group_id
            AND g.owner_id = public.current_app_user_id()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'study_group_notes' AND policyname = 'study_group_notes_insert_member'
  ) THEN
    CREATE POLICY "study_group_notes_insert_member" ON "study_group_notes"
      FOR INSERT
      WITH CHECK (
        user_id = public.current_app_user_id()
        AND (
          EXISTS (
            SELECT 1 FROM public.study_group_members gm
            WHERE gm.group_id = study_group_notes.group_id
              AND gm.user_id = public.current_app_user_id()
          )
          OR EXISTS (
            SELECT 1 FROM public.study_groups g
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
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'study_group_notes' AND policyname = 'study_group_notes_delete_author_or_owner'
  ) THEN
    CREATE POLICY "study_group_notes_delete_author_or_owner" ON "study_group_notes"
      FOR DELETE
      USING (
        user_id = public.current_app_user_id()
        OR EXISTS (
          SELECT 1 FROM public.study_groups g
          WHERE g.id = study_group_notes.group_id
            AND g.owner_id = public.current_app_user_id()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'saved_sources' AND policyname = 'saved_sources_select_own'
  ) THEN
    CREATE POLICY "saved_sources_select_own" ON "saved_sources"
      FOR SELECT
      USING (user_id = public.current_app_user_id());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'saved_sources' AND policyname = 'saved_sources_insert_own'
  ) THEN
    CREATE POLICY "saved_sources_insert_own" ON "saved_sources"
      FOR INSERT
      WITH CHECK (user_id = public.current_app_user_id());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'saved_sources' AND policyname = 'saved_sources_update_own'
  ) THEN
    CREATE POLICY "saved_sources_update_own" ON "saved_sources"
      FOR UPDATE
      USING (user_id = public.current_app_user_id())
      WITH CHECK (user_id = public.current_app_user_id());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'saved_sources' AND policyname = 'saved_sources_delete_own'
  ) THEN
    CREATE POLICY "saved_sources_delete_own" ON "saved_sources"
      FOR DELETE
      USING (user_id = public.current_app_user_id());
  END IF;
END $$;
