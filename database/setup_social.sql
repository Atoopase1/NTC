-- ============================================
-- NTC Exam Prep - Social Post System Setup
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. Create lesson_likes table
CREATE TABLE IF NOT EXISTS public.lesson_likes (
  id uuid default gen_random_uuid() primary key,
  lesson_id uuid references public.lessons on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  UNIQUE(lesson_id, user_id)
);

-- Enable RLS
ALTER TABLE public.lesson_likes ENABLE ROW LEVEL SECURITY;

-- Policies for lesson_likes
DROP POLICY IF EXISTS "Anyone can view likes" ON public.lesson_likes;
CREATE POLICY "Anyone can view likes"
  ON public.lesson_likes FOR SELECT
  USING ( true );

DROP POLICY IF EXISTS "Auth users can insert likes" ON public.lesson_likes;
CREATE POLICY "Auth users can insert likes"
  ON public.lesson_likes FOR INSERT
  WITH CHECK ( auth.uid() = user_id );

DROP POLICY IF EXISTS "Auth users can delete likes" ON public.lesson_likes;
CREATE POLICY "Auth users can delete likes"
  ON public.lesson_likes FOR DELETE
  USING ( auth.uid() = user_id );


-- 2. Create lesson_comments table
CREATE TABLE IF NOT EXISTS public.lesson_comments (
  id uuid default gen_random_uuid() primary key,
  lesson_id uuid references public.lessons on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  parent_id uuid references public.lesson_comments on delete cascade,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable RLS
ALTER TABLE public.lesson_comments ENABLE ROW LEVEL SECURITY;

-- Policies for lesson_comments
DROP POLICY IF EXISTS "Anyone can view comments" ON public.lesson_comments;
CREATE POLICY "Anyone can view comments"
  ON public.lesson_comments FOR SELECT
  USING ( true );

DROP POLICY IF EXISTS "Auth users can insert comments" ON public.lesson_comments;
CREATE POLICY "Auth users can insert comments"
  ON public.lesson_comments FOR INSERT
  WITH CHECK ( auth.uid() = user_id );

DROP POLICY IF EXISTS "Auth users can update comments" ON public.lesson_comments;
CREATE POLICY "Auth users can update comments"
  ON public.lesson_comments FOR UPDATE
  USING ( auth.uid() = user_id );

DROP POLICY IF EXISTS "Auth users can delete comments" ON public.lesson_comments;
CREATE POLICY "Auth users can delete comments"
  ON public.lesson_comments FOR DELETE
  USING ( auth.uid() = user_id );

-- Also allow admin to delete any comment (replace with actual admin email if needed)
DROP POLICY IF EXISTS "Admin can delete any comment" ON public.lesson_comments;
CREATE POLICY "Admin can delete any comment"
  ON public.lesson_comments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() AND auth.users.email = 'atoopase@gmail.com'
    )
  );
