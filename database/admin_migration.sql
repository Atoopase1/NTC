-- ================================================================
-- NTC EXAM PREP — SUPER ADMIN MIGRATION
-- Adds admin_permissions column and updates RLS.
-- ================================================================

-- 1. Add admin_permissions column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_permissions jsonb DEFAULT '[]'::jsonb;

-- 2. Add Super Admin Override Policy for Profiles
-- This allows atoopase@gmail.com to update roles, permissions, and block any user.
DROP POLICY IF EXISTS "profiles_update_superadmin" ON public.profiles;
CREATE POLICY "profiles_update_superadmin"
  ON public.profiles FOR UPDATE
  USING ( (auth.jwt() ->> 'email') = 'atoopase@gmail.com' );

-- 3. Update existing admin policies on other tables to respect the 'admin' role
-- We use a security definer function to avoid infinite recursion when checking roles!

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
DECLARE
  user_role text;
BEGIN
  -- Super admin check via JWT is always true
  IF (current_setting('request.jwt.claims', true)::json->>'email') = 'atoopase@gmail.com' THEN
    RETURN true;
  END IF;
  
  -- Normal admin check
  SELECT role INTO user_role FROM public.profiles WHERE id = auth.uid();
  RETURN user_role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Apply the new is_admin() function to table policies to grant access to ALL admins

-- Subjects
DROP POLICY IF EXISTS "subjects_insert_admin" ON public.subjects;
CREATE POLICY "subjects_insert_admin" ON public.subjects FOR INSERT WITH CHECK ( public.is_admin() );
DROP POLICY IF EXISTS "subjects_update_admin" ON public.subjects;
CREATE POLICY "subjects_update_admin" ON public.subjects FOR UPDATE USING ( public.is_admin() );
DROP POLICY IF EXISTS "subjects_delete_admin" ON public.subjects;
CREATE POLICY "subjects_delete_admin" ON public.subjects FOR DELETE USING ( public.is_admin() );

-- Lessons (Materials)
DROP POLICY IF EXISTS "lessons_insert_admin" ON public.lessons;
CREATE POLICY "lessons_insert_admin" ON public.lessons FOR INSERT WITH CHECK ( public.is_admin() );
DROP POLICY IF EXISTS "lessons_update_admin" ON public.lessons;
CREATE POLICY "lessons_update_admin" ON public.lessons FOR UPDATE USING ( public.is_admin() );
DROP POLICY IF EXISTS "lessons_delete_admin" ON public.lessons;
CREATE POLICY "lessons_delete_admin" ON public.lessons FOR DELETE USING ( public.is_admin() );

-- Scheduled Exams
DROP POLICY IF EXISTS "scheduled_exams_insert_admin" ON public.scheduled_exams;
CREATE POLICY "scheduled_exams_insert_admin" ON public.scheduled_exams FOR INSERT WITH CHECK ( public.is_admin() );
DROP POLICY IF EXISTS "scheduled_exams_update_admin" ON public.scheduled_exams;
CREATE POLICY "scheduled_exams_update_admin" ON public.scheduled_exams FOR UPDATE USING ( public.is_admin() );
DROP POLICY IF EXISTS "scheduled_exams_delete_admin" ON public.scheduled_exams;
CREATE POLICY "scheduled_exams_delete_admin" ON public.scheduled_exams FOR DELETE USING ( public.is_admin() );

-- Messages (Announcements/Chats)
DROP POLICY IF EXISTS "messages_delete_admin" ON public.messages;
CREATE POLICY "messages_delete_admin" ON public.messages FOR DELETE USING ( public.is_admin() );

-- Exam Results (Admins can delete/view)
DROP POLICY IF EXISTS "exam_results_delete_admin" ON public.exam_results;
CREATE POLICY "exam_results_delete_admin" ON public.exam_results FOR DELETE USING ( public.is_admin() );

-- Note: Normal admins will enforce their granular permissions (Users, Lessons, Exams) 
-- on the frontend via JavaScript, since complex RLS is too slow/fragile.
