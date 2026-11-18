-- ==============================================================================
-- PREPTRACK UPGRADE — MASTER SQL MIGRATION FILE
-- File: preptrack_migration.sql
-- Description:
--   Comprehensive database migration for the PrepTrack educational platform upgrade.
--   Introduces Student Course Preferences ("My Courses"), Geofenced Attendance Management,
--   Profiles extensions (admin_permissions, index_number), Performance Indexes,
--   Granular Role-Based Access Control (RLS) for Admin roles, and Realtime Publications.
--
-- Safety & Idempotency:
--   - Completely safe to execute multiple times on production or development.
--   - Uses IF NOT EXISTS, DROP POLICY IF EXISTS, and dynamic publication checks.
--   - Preserves all existing student profiles, exam results, lesson materials, and mock exams.
--
-- Execution Order:
--   1. Extensions & Profile Table Alterations
--   2. Student Course Preferences Schema & RLS
--   3. Attendance Sessions Schema & RLS
--   4. Attendance Submissions Schema & RLS
--   5. Updating Existing RLS Policies for Admin Roles (Lessons, Subjects, Scheduled Exams)
--   6. Performance Index Creation
--   7. Supabase Realtime Publication Setup
--   8. Verification Queries
-- ==============================================================================

-- ── 1. PROFILES EXTENSIONS ───────────────────────────────────────────────────
-- Ensure admin permissions JSON array and index number columns exist on profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS admin_permissions JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS index_number TEXT;


-- ── 2. STUDENT COURSE PREFERENCES TABLE ─────────────────────────────────────
-- Allows students to select and personalize courses relevant to their study program
CREATE TABLE IF NOT EXISTS public.student_course_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, subject_id)
);

-- Enable Row Level Security
ALTER TABLE public.student_course_preferences ENABLE ROW LEVEL SECURITY;

-- Students manage their own course selections (SELECT, INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS "Users manage own course preferences" ON public.student_course_preferences;
CREATE POLICY "Users manage own course preferences" ON public.student_course_preferences
  FOR ALL 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);

-- Admins and Super Admin can view all course preferences for analytics/reporting
DROP POLICY IF EXISTS "Admins view all course preferences" ON public.student_course_preferences;
CREATE POLICY "Admins view all course preferences" ON public.student_course_preferences
  FOR SELECT 
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' 
    OR (auth.jwt() ->> 'email') = 'atoopase@gmail.com'
  );


-- ── 3. ATTENDANCE SESSIONS TABLE ─────────────────────────────────────────────
-- Geofenced class/exam attendance sessions managed by administrators
CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  session_date DATE NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER,
  instructions TEXT,
  reference_lat NUMERIC(10,8),
  reference_lng NUMERIC(11,8),
  location_name TEXT,
  radius_meters INTEGER DEFAULT 30,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('active','scheduled','closed')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view attendance sessions
DROP POLICY IF EXISTS "Anyone can view attendance sessions" ON public.attendance_sessions;
CREATE POLICY "Anyone can view attendance sessions" ON public.attendance_sessions 
  FOR SELECT 
  USING (true);

-- Admins and Super Admin can manage (Insert, Update, Delete) attendance sessions
DROP POLICY IF EXISTS "Admins can manage attendance sessions" ON public.attendance_sessions;
CREATE POLICY "Admins can manage attendance sessions" ON public.attendance_sessions
  FOR ALL 
  USING (
    (auth.jwt() ->> 'email') = 'atoopase@gmail.com' 
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'atoopase@gmail.com' 
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );


-- ── 4. ATTENDANCE SUBMISSIONS TABLE ──────────────────────────────────────────
-- GPS-verified attendance submissions by students
CREATE TABLE IF NOT EXISTS public.attendance_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.attendance_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  full_name TEXT NOT NULL,
  index_number TEXT NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  student_lat NUMERIC(10,8),
  student_lng NUMERIC(11,8),
  distance_meters NUMERIC(10,2),
  location_accuracy NUMERIC(10,2),
  is_within_radius BOOLEAN,
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('verified','rejected','pending')),
  UNIQUE(session_id, user_id)
);

-- Enable Row Level Security
ALTER TABLE public.attendance_submissions ENABLE ROW LEVEL SECURITY;

-- Students can insert their own attendance submission
DROP POLICY IF EXISTS "Students can submit attendance" ON public.attendance_submissions;
CREATE POLICY "Students can submit attendance" ON public.attendance_submissions
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Students can view their own submissions; Admins can view all submissions
DROP POLICY IF EXISTS "Students can view own submissions" ON public.attendance_submissions;
CREATE POLICY "Students can view own submissions" ON public.attendance_submissions
  FOR SELECT 
  USING (
    auth.uid() = user_id 
    OR (auth.jwt() ->> 'email') = 'atoopase@gmail.com' 
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Students can update their own submissions if required
DROP POLICY IF EXISTS "Students can update own submissions" ON public.attendance_submissions;
CREATE POLICY "Students can update own submissions" ON public.attendance_submissions
  FOR UPDATE 
  USING (auth.uid() = user_id);

-- Admins can update/delete attendance submissions
DROP POLICY IF EXISTS "Admins can update attendance submissions" ON public.attendance_submissions;
CREATE POLICY "Admins can update attendance submissions" ON public.attendance_submissions
  FOR UPDATE 
  USING (
    (auth.jwt() ->> 'email') = 'atoopase@gmail.com' 
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "Admins can delete attendance submissions" ON public.attendance_submissions;
CREATE POLICY "Admins can delete attendance submissions" ON public.attendance_submissions
  FOR DELETE 
  USING (
    (auth.jwt() ->> 'email') = 'atoopase@gmail.com' 
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );


-- ── 5. UPDATE EXISTING ADMIN-ONLY POLICIES FOR ADMIN ROLES ───────────────────
-- Grant full management permissions to users with role = 'admin' as well as Super Admin.
-- Retains public SELECT policies for students.

-- 5.1 Lessons / Study Materials
DROP POLICY IF EXISTS "Admin can insert lessons" ON public.lessons;
DROP POLICY IF EXISTS "Admin can update lessons" ON public.lessons;
DROP POLICY IF EXISTS "Admin can delete lessons" ON public.lessons;
DROP POLICY IF EXISTS "lessons_insert_admin" ON public.lessons;
DROP POLICY IF EXISTS "lessons_update_admin" ON public.lessons;
DROP POLICY IF EXISTS "lessons_delete_admin" ON public.lessons;

CREATE POLICY "lessons_insert_admin" ON public.lessons
  FOR INSERT WITH CHECK (
    (auth.jwt() ->> 'email') = 'atoopase@gmail.com' 
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "lessons_update_admin" ON public.lessons
  FOR UPDATE USING (
    (auth.jwt() ->> 'email') = 'atoopase@gmail.com' 
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "lessons_delete_admin" ON public.lessons
  FOR DELETE USING (
    (auth.jwt() ->> 'email') = 'atoopase@gmail.com' 
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- 5.2 Subjects / Courses
DROP POLICY IF EXISTS "Admin can insert subjects" ON public.subjects;
DROP POLICY IF EXISTS "Admin can update subjects" ON public.subjects;
DROP POLICY IF EXISTS "Admin can delete subjects" ON public.subjects;
DROP POLICY IF EXISTS "subjects_insert_admin" ON public.subjects;
DROP POLICY IF EXISTS "subjects_update_admin" ON public.subjects;
DROP POLICY IF EXISTS "subjects_delete_admin" ON public.subjects;

CREATE POLICY "subjects_insert_admin" ON public.subjects
  FOR INSERT WITH CHECK (
    (auth.jwt() ->> 'email') = 'atoopase@gmail.com' 
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "subjects_update_admin" ON public.subjects
  FOR UPDATE USING (
    (auth.jwt() ->> 'email') = 'atoopase@gmail.com' 
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "subjects_delete_admin" ON public.subjects
  FOR DELETE USING (
    (auth.jwt() ->> 'email') = 'atoopase@gmail.com' 
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- 5.3 Scheduled Exams
DROP POLICY IF EXISTS "Admin can manage scheduled exams" ON public.scheduled_exams;
DROP POLICY IF EXISTS "Admin can insert scheduled exams" ON public.scheduled_exams;
DROP POLICY IF EXISTS "Admin can update scheduled exams" ON public.scheduled_exams;
DROP POLICY IF EXISTS "Admin can delete scheduled exams" ON public.scheduled_exams;
DROP POLICY IF EXISTS "scheduled_exams_insert_admin" ON public.scheduled_exams;
DROP POLICY IF EXISTS "scheduled_exams_update_admin" ON public.scheduled_exams;
DROP POLICY IF EXISTS "scheduled_exams_delete_admin" ON public.scheduled_exams;

CREATE POLICY "scheduled_exams_insert_admin" ON public.scheduled_exams
  FOR INSERT WITH CHECK (
    (auth.jwt() ->> 'email') = 'atoopase@gmail.com' 
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "scheduled_exams_update_admin" ON public.scheduled_exams
  FOR UPDATE USING (
    (auth.jwt() ->> 'email') = 'atoopase@gmail.com' 
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "scheduled_exams_delete_admin" ON public.scheduled_exams
  FOR DELETE USING (
    (auth.jwt() ->> 'email') = 'atoopase@gmail.com' 
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );


-- ── 6. PERFORMANCE INDEXES ──────────────────────────────────────────────────
-- Indexes to speed up queries on attendance, course preferences, and session scheduling
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_status 
  ON public.attendance_sessions(status);

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_dates 
  ON public.attendance_sessions(session_date, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_attendance_submissions_session 
  ON public.attendance_submissions(session_id);

CREATE INDEX IF NOT EXISTS idx_attendance_submissions_user 
  ON public.attendance_submissions(user_id);

CREATE INDEX IF NOT EXISTS idx_student_course_preferences_user 
  ON public.student_course_preferences(user_id);

CREATE INDEX IF NOT EXISTS idx_student_course_preferences_subject 
  ON public.student_course_preferences(subject_id);


-- ── 7. SUPABASE REALTIME PUBLICATION ────────────────────────────────────────
-- Safely add attendance tables to supabase_realtime publication if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'attendance_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_sessions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'attendance_submissions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_submissions;
  END IF;
END $$;


-- ── 8. VERIFICATION QUERIES ─────────────────────────────────────────────────
-- Run these queries in the Supabase SQL Editor after migration to confirm everything is applied:
--
-- 1. Check if tables exist:
-- SELECT table_name 
-- FROM information_schema.tables 
-- WHERE table_schema = 'public' 
--   AND table_name IN ('student_course_preferences', 'attendance_sessions', 'attendance_submissions');
--
-- 2. Check initial count (should be 0 for new tables):
-- SELECT COUNT(*) AS sessions_count FROM public.attendance_sessions;
-- SELECT COUNT(*) AS submissions_count FROM public.attendance_submissions;
-- SELECT COUNT(*) AS preferences_count FROM public.student_course_preferences;
--
-- 3. Check profile columns:
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'profiles' 
--   AND column_name IN ('admin_permissions', 'index_number');
--
-- 4. Check active RLS policies:
-- SELECT tablename, policyname, cmd 
-- FROM pg_policies 
-- WHERE schemaname = 'public' 
-- ORDER BY tablename, policyname;
