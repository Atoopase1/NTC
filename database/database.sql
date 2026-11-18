-- ============================================
-- NTC Exam Prep - Supabase Database Setup
-- Safe to run multiple times!
-- ============================================

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  dob text,
  school text,
  bio text,
  role text default 'student',
  blocked_until timestamp with time zone default null,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone."
  ON public.profiles FOR SELECT
  USING ( true );

DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
CREATE POLICY "Users can insert their own profile."
  ON public.profiles FOR INSERT
  WITH CHECK ( auth.uid() = id );

DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
CREATE POLICY "Users can update own profile."
  ON public.profiles FOR UPDATE
  USING ( auth.uid() = id );

-- 2. Exam Results Table
CREATE TABLE IF NOT EXISTS public.exam_results (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  subject text not null,
  score integer not null,
  total integer not null,
  percentage numeric not null,
  time_used text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own exam results." ON public.exam_results;
CREATE POLICY "Users can view their own exam results."
  ON public.exam_results FOR SELECT
  USING ( auth.uid() = user_id );

DROP POLICY IF EXISTS "Admin can view all exam results" ON public.exam_results;
CREATE POLICY "Admin can view all exam results"
  ON public.exam_results FOR SELECT
  USING ( (auth.jwt() ->> 'email') = 'atoopase@gmail.com' );

DROP POLICY IF EXISTS "Users can insert their own exam results." ON public.exam_results;
CREATE POLICY "Users can insert their own exam results."
  ON public.exam_results FOR INSERT
  WITH CHECK ( auth.uid() = user_id );

-- 3. Automatic Profile Creation Trigger
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone, avatar_url)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.email,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Profile creation failed for user %: %', new.id, SQLERRM;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ============================================
-- 4. Admin Lessons Table
-- ============================================

CREATE TABLE IF NOT EXISTS public.lessons (
  id uuid default gen_random_uuid() primary key,
  topic text not null,
  subtopic text not null,
  type text not null check (type in ('video', 'pdf', 'text')),
  media_url text,
  content text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view lessons" ON public.lessons;
CREATE POLICY "Anyone can view lessons"
  ON public.lessons FOR SELECT
  USING ( true );

-- Security: Only allow the specific admin email to insert lessons
DROP POLICY IF EXISTS "Admin can insert lessons" ON public.lessons;
CREATE POLICY "Admin can insert lessons"
  ON public.lessons FOR INSERT
  WITH CHECK ( (auth.jwt() ->> 'email') = 'atoopase@gmail.com' );

-- Security: Only allow the specific admin email to update lessons
DROP POLICY IF EXISTS "Admin can update lessons" ON public.lessons;
CREATE POLICY "Admin can update lessons"
  ON public.lessons FOR UPDATE
  USING ( (auth.jwt() ->> 'email') = 'atoopase@gmail.com' );

-- Security: Only allow admin to delete lessons
DROP POLICY IF EXISTS "Admin can delete lessons" ON public.lessons;
CREATE POLICY "Admin can delete lessons"
  ON public.lessons FOR DELETE
  USING ( (auth.jwt() ->> 'email') = 'atoopase@gmail.com' );

-- ============================================
-- 5. Subjects Table
-- ============================================

CREATE TABLE IF NOT EXISTS public.subjects (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view subjects" ON public.subjects;
CREATE POLICY "Anyone can view subjects"
  ON public.subjects FOR SELECT
  USING ( true );

-- Admin-only: insert subjects
DROP POLICY IF EXISTS "Admin can insert subjects" ON public.subjects;
CREATE POLICY "Admin can insert subjects"
  ON public.subjects FOR INSERT
  WITH CHECK ( (auth.jwt() ->> 'email') = 'atoopase@gmail.com' );

-- Admin-only: update subjects
DROP POLICY IF EXISTS "Admin can update subjects" ON public.subjects;
CREATE POLICY "Admin can update subjects"
  ON public.subjects FOR UPDATE
  USING ( (auth.jwt() ->> 'email') = 'atoopase@gmail.com' );

-- Admin-only: delete subjects
DROP POLICY IF EXISTS "Admin can delete subjects" ON public.subjects;
CREATE POLICY "Admin can delete subjects"
  ON public.subjects FOR DELETE
  USING ( (auth.jwt() ->> 'email') = 'atoopase@gmail.com' );

-- Drop the old catch-all policy if it exists
DROP POLICY IF EXISTS "Admin can manage subjects" ON public.subjects;

-- Insert default subjects if they don't exist
INSERT INTO public.subjects (name)
VALUES 
  ('Pedagogy'), 
  ('General Knowledge'), 
  ('Curriculum Studies'), 
  ('Assessment'), 
  ('ICT in Education'), 
  ('Educational Psychology')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- 6. Scheduled Exams Table
-- ============================================

CREATE TABLE IF NOT EXISTS public.scheduled_exams (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  subject text not null,
  start_time timestamp with time zone not null,
  end_time timestamp with time zone not null,
  duration_minutes integer not null default 60,
  questions_data jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

ALTER TABLE public.scheduled_exams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view scheduled exams" ON public.scheduled_exams;
CREATE POLICY "Anyone can view scheduled exams"
  ON public.scheduled_exams FOR SELECT
  USING ( true );

-- Admin-only: manage scheduled exams
DROP POLICY IF EXISTS "Admin can manage scheduled exams" ON public.scheduled_exams;
DROP POLICY IF EXISTS "Admin can insert scheduled exams" ON public.scheduled_exams;
DROP POLICY IF EXISTS "Admin can delete scheduled exams" ON public.scheduled_exams;

CREATE POLICY "Admin can insert scheduled exams"
  ON public.scheduled_exams FOR INSERT
  WITH CHECK ( (auth.jwt() ->> 'email') = 'atoopase@gmail.com' );

CREATE POLICY "Admin can delete scheduled exams"
  ON public.scheduled_exams FOR DELETE
  USING ( (auth.jwt() ->> 'email') = 'atoopase@gmail.com' );

CREATE POLICY "Admin can update scheduled exams"
  ON public.scheduled_exams FOR UPDATE
  USING ( (auth.jwt() ->> 'email') = 'atoopase@gmail.com' );

-- Modify exam_results to add scheduled_exam_id
ALTER TABLE public.exam_results 
ADD COLUMN IF NOT EXISTS scheduled_exam_id uuid references public.scheduled_exams on delete cascade;

-- ============================================
-- 7. Admin Student Management Policies
-- (No recursive profile lookups — uses jwt email only)
-- ============================================

-- Drop old conflicting policies on profiles
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin can delete profiles" ON public.profiles;

-- Allow everyone to read all profiles (leaderboard, rankings need this)
CREATE POLICY "Public profiles are viewable by everyone."
  ON public.profiles FOR SELECT
  USING ( true );

-- Admin can delete any profile
CREATE POLICY "Admin can delete profiles"
  ON public.profiles FOR DELETE
  USING ( (auth.jwt() ->> 'email') = 'atoopase@gmail.com' );

-- Drop old exam_results SELECT policy and replace with unified one
DROP POLICY IF EXISTS "Users can view their own exam results." ON public.exam_results;
DROP POLICY IF EXISTS "Admin can view all exam results" ON public.exam_results;
DROP POLICY IF EXISTS "Admin can delete exam results" ON public.exam_results;

CREATE POLICY "Users can view their own exam results."
  ON public.exam_results FOR SELECT
  USING (
    auth.uid() = user_id
    OR (auth.jwt() ->> 'email') = 'atoopase@gmail.com'
  );

CREATE POLICY "Admin can delete exam results"
  ON public.exam_results FOR DELETE
  USING (
    auth.uid() = user_id
    OR (auth.jwt() ->> 'email') = 'atoopase@gmail.com'
  );
