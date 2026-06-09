-- ================================================================
-- NTC EXAM PREP — EMERGENCY RLS FIX
-- Run this in your Supabase SQL Editor.
-- Drops ALL policies on affected tables and recreates them clean.
-- No recursive profile lookups anywhere.
-- ================================================================

-- ── 1. DROP ALL policies on profiles ────────────────────────────
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile."       ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile."             ON public.profiles;
DROP POLICY IF EXISTS "Admin can view all profiles"               ON public.profiles;
DROP POLICY IF EXISTS "Admin can delete profiles"                 ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all"                       ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"                       ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"                       ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_admin"                     ON public.profiles;

-- Recreate cleanly
CREATE POLICY "profiles_select_all"
  ON public.profiles FOR SELECT USING ( true );

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK ( auth.uid() = id );

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING ( auth.uid() = id );

CREATE POLICY "profiles_delete_admin"
  ON public.profiles FOR DELETE
  USING ( (auth.jwt() ->> 'email') = 'atoopase@gmail.com' );


-- ── 2. DROP ALL policies on subjects ────────────────────────────
DROP POLICY IF EXISTS "Anyone can view subjects"   ON public.subjects;
DROP POLICY IF EXISTS "Admin can manage subjects"  ON public.subjects;
DROP POLICY IF EXISTS "Admin can insert subjects"  ON public.subjects;
DROP POLICY IF EXISTS "Admin can update subjects"  ON public.subjects;
DROP POLICY IF EXISTS "Admin can delete subjects"  ON public.subjects;
DROP POLICY IF EXISTS "subjects_select_all"        ON public.subjects;
DROP POLICY IF EXISTS "subjects_insert_admin"      ON public.subjects;
DROP POLICY IF EXISTS "subjects_update_admin"      ON public.subjects;
DROP POLICY IF EXISTS "subjects_delete_admin"      ON public.subjects;

-- Recreate cleanly
CREATE POLICY "subjects_select_all"
  ON public.subjects FOR SELECT USING ( true );

CREATE POLICY "subjects_insert_admin"
  ON public.subjects FOR INSERT
  WITH CHECK ( (auth.jwt() ->> 'email') = 'atoopase@gmail.com' );

CREATE POLICY "subjects_update_admin"
  ON public.subjects FOR UPDATE
  USING ( (auth.jwt() ->> 'email') = 'atoopase@gmail.com' );

CREATE POLICY "subjects_delete_admin"
  ON public.subjects FOR DELETE
  USING ( (auth.jwt() ->> 'email') = 'atoopase@gmail.com' );


-- ── 3. DROP ALL policies on exam_results ────────────────────────
DROP POLICY IF EXISTS "Users can view their own exam results."   ON public.exam_results;
DROP POLICY IF EXISTS "Users can insert their own exam results." ON public.exam_results;
DROP POLICY IF EXISTS "Admin can view all exam results"          ON public.exam_results;
DROP POLICY IF EXISTS "Admin can delete exam results"            ON public.exam_results;
DROP POLICY IF EXISTS "exam_results_select"                      ON public.exam_results;
DROP POLICY IF EXISTS "exam_results_insert_own"                  ON public.exam_results;
DROP POLICY IF EXISTS "exam_results_delete"                      ON public.exam_results;

-- Recreate cleanly
CREATE POLICY "exam_results_select"
  ON public.exam_results FOR SELECT
  USING (
    auth.uid() = user_id
    OR (auth.jwt() ->> 'email') = 'atoopase@gmail.com'
  );

CREATE POLICY "exam_results_insert_own"
  ON public.exam_results FOR INSERT
  WITH CHECK ( auth.uid() = user_id );

CREATE POLICY "exam_results_delete"
  ON public.exam_results FOR DELETE
  USING (
    auth.uid() = user_id
    OR (auth.jwt() ->> 'email') = 'atoopase@gmail.com'
  );


-- ── 4. DROP ALL policies on scheduled_exams ─────────────────────
DROP POLICY IF EXISTS "Anyone can view scheduled exams"    ON public.scheduled_exams;
DROP POLICY IF EXISTS "Admin can manage scheduled exams"   ON public.scheduled_exams;
DROP POLICY IF EXISTS "Admin can insert scheduled exams"   ON public.scheduled_exams;
DROP POLICY IF EXISTS "Admin can delete scheduled exams"   ON public.scheduled_exams;
DROP POLICY IF EXISTS "scheduled_exams_select_all"         ON public.scheduled_exams;
DROP POLICY IF EXISTS "scheduled_exams_insert_admin"       ON public.scheduled_exams;
DROP POLICY IF EXISTS "scheduled_exams_delete_admin"       ON public.scheduled_exams;

-- Recreate cleanly
CREATE POLICY "scheduled_exams_select_all"
  ON public.scheduled_exams FOR SELECT USING ( true );

CREATE POLICY "scheduled_exams_insert_admin"
  ON public.scheduled_exams FOR INSERT
  WITH CHECK ( (auth.jwt() ->> 'email') = 'atoopase@gmail.com' );

CREATE POLICY "scheduled_exams_delete_admin"
  ON public.scheduled_exams FOR DELETE
  USING ( (auth.jwt() ->> 'email') = 'atoopase@gmail.com' );


-- ── 5. DROP ALL policies on lessons ─────────────────────────────
DROP POLICY IF EXISTS "Anyone can view lessons"   ON public.lessons;
DROP POLICY IF EXISTS "Admin can insert lessons"  ON public.lessons;
DROP POLICY IF EXISTS "Admin can update lessons"  ON public.lessons;
DROP POLICY IF EXISTS "Admin can delete lessons"  ON public.lessons;
DROP POLICY IF EXISTS "lessons_select_all"        ON public.lessons;
DROP POLICY IF EXISTS "lessons_insert_admin"      ON public.lessons;
DROP POLICY IF EXISTS "lessons_update_admin"      ON public.lessons;
DROP POLICY IF EXISTS "lessons_delete_admin"      ON public.lessons;

-- Recreate cleanly
CREATE POLICY "lessons_select_all"
  ON public.lessons FOR SELECT USING ( true );

CREATE POLICY "lessons_insert_admin"
  ON public.lessons FOR INSERT
  WITH CHECK ( (auth.jwt() ->> 'email') = 'atoopase@gmail.com' );

CREATE POLICY "lessons_update_admin"
  ON public.lessons FOR UPDATE
  USING ( (auth.jwt() ->> 'email') = 'atoopase@gmail.com' );

CREATE POLICY "lessons_delete_admin"
  ON public.lessons FOR DELETE
  USING ( (auth.jwt() ->> 'email') = 'atoopase@gmail.com' );


-- ================================================================
-- 6. Update lessons table to support rich media
-- ================================================================

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS content text;

-- Backfill title from subtopic if exists
UPDATE public.lessons SET title = subtopic WHERE title IS NULL AND subtopic IS NOT NULL;


-- ================================================================
-- 7. Supabase Storage Bucket for lesson materials
-- ================================================================

-- Create public bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lesson-materials',
  'lesson-materials',
  true,
  52428800,  -- 50 MB
  ARRAY[
    'image/jpeg','image/png','image/gif','image/webp','image/svg+xml',
    'video/mp4','video/webm','video/ogg','video/quicktime',
    'audio/mpeg','audio/ogg','audio/wav','audio/webm',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','application/zip'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800;

-- Drop old storage policies if they exist
DROP POLICY IF EXISTS "Admin can upload lesson materials" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view lesson materials"  ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete lesson materials" ON storage.objects;

-- Admin can upload
CREATE POLICY "Admin can upload lesson materials"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'lesson-materials'
    AND (auth.jwt() ->> 'email') = 'atoopase@gmail.com'
  );

-- Everyone can view/download
CREATE POLICY "Anyone can view lesson materials"
  ON storage.objects FOR SELECT
  USING ( bucket_id = 'lesson-materials' );

-- Admin can delete files
CREATE POLICY "Admin can delete lesson materials"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'lesson-materials'
    AND (auth.jwt() ->> 'email') = 'atoopase@gmail.com'
  );
