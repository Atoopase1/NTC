-- ==============================================================================
-- PrepTrack - Permanent Courses & Attendance Database Migration
-- Run this in your Supabase Dashboard: SQL Editor -> New Query -> Paste & Run
-- ==============================================================================

-- 1. Ensure public.subjects table exists
CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Enable RLS on subjects
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read subjects
DROP POLICY IF EXISTS "Anyone can view subjects" ON public.subjects;
DROP POLICY IF EXISTS "subjects_select_all" ON public.subjects;
CREATE POLICY "Anyone can view subjects" 
  ON public.subjects FOR SELECT 
  USING (true);

-- Allow admins to insert, update, and delete subjects permanently
DROP POLICY IF EXISTS "Admin can insert subjects" ON public.subjects;
DROP POLICY IF EXISTS "Admin can update subjects" ON public.subjects;
DROP POLICY IF EXISTS "Admin can delete subjects" ON public.subjects;
DROP POLICY IF EXISTS "subjects_insert_admin" ON public.subjects;
DROP POLICY IF EXISTS "subjects_update_admin" ON public.subjects;
DROP POLICY IF EXISTS "subjects_delete_admin" ON public.subjects;
DROP POLICY IF EXISTS "Admin can manage subjects" ON public.subjects;

CREATE POLICY "Admin can insert subjects" 
  ON public.subjects FOR INSERT 
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'atoopase@gmail.com' 
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (auth.role() = 'service_role')
  );

CREATE POLICY "Admin can update subjects" 
  ON public.subjects FOR UPDATE 
  USING (
    (auth.jwt() ->> 'email') = 'atoopase@gmail.com' 
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (auth.role() = 'service_role')
  );

CREATE POLICY "Admin can delete subjects" 
  ON public.subjects FOR DELETE 
  USING (
    (auth.jwt() ->> 'email') = 'atoopase@gmail.com' 
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (auth.role() = 'service_role')
  );

-- 2. Ensure foreign key on student_course_preferences cascades on delete
-- This prevents "foreign key constraint violation" when a course is deleted
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'student_course_preferences'
  ) THEN
    ALTER TABLE public.student_course_preferences 
      DROP CONSTRAINT IF EXISTS student_course_preferences_subject_id_fkey;

    ALTER TABLE public.student_course_preferences
      ADD CONSTRAINT student_course_preferences_subject_id_fkey
      FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Ensure Attendance Sessions & Submissions have class_name and week
ALTER TABLE public.attendance_sessions 
  ADD COLUMN IF NOT EXISTS class_name TEXT DEFAULT 'Class A',
  ADD COLUMN IF NOT EXISTS week TEXT DEFAULT 'Week 1';

ALTER TABLE public.attendance_submissions 
  ADD COLUMN IF NOT EXISTS class_name TEXT,
  ADD COLUMN IF NOT EXISTS week TEXT;

-- 4. Ensure admin can update attendance submission verification status (Verify / Flag)
DROP POLICY IF EXISTS "Admins can update all attendance submissions" ON public.attendance_submissions;
CREATE POLICY "Admins can update all attendance submissions" 
  ON public.attendance_submissions FOR UPDATE 
  USING (
    (auth.jwt() ->> 'email') = 'atoopase@gmail.com' 
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR auth.uid() = user_id
  );

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_subjects_name ON public.subjects(name);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_class_week ON public.attendance_sessions(class_name, week);
CREATE INDEX IF NOT EXISTS idx_attendance_submissions_status ON public.attendance_submissions(verification_status);
