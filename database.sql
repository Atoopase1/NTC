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
    new.raw_user_meta_data->>'full_name',
    new.email,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
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
  WITH CHECK ( 
    auth.uid() IN (SELECT id FROM auth.users WHERE email = 'atoopase@gmail.com')
    OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Security: Only allow the specific admin email to update lessons
DROP POLICY IF EXISTS "Admin can update lessons" ON public.lessons;
CREATE POLICY "Admin can update lessons"
  ON public.lessons FOR UPDATE
  USING ( 
    auth.uid() IN (SELECT id FROM auth.users WHERE email = 'atoopase@gmail.com')
    OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );
