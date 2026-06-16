-- ============================================================
-- NTC Exam Prep — Migration v2
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- Safe to run multiple times.
-- ============================================================

-- 1. Add missing 'title' column to exam_results
ALTER TABLE public.exam_results
  ADD COLUMN IF NOT EXISTS title text;

-- 2. Create student_exam_submissions table for duplicate prevention
--    One row per (user_id, scheduled_exam_id) pair.
CREATE TABLE IF NOT EXISTS public.student_exam_submissions (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid references auth.users on delete cascade not null,
  scheduled_exam_id uuid references public.scheduled_exams on delete cascade not null,
  submitted_at     timestamp with time zone default timezone('utc'::text, now()),
  UNIQUE (user_id, scheduled_exam_id)
);

ALTER TABLE public.student_exam_submissions ENABLE ROW LEVEL SECURITY;

-- Students can view their own submissions
DROP POLICY IF EXISTS "Users can view own submissions" ON public.student_exam_submissions;
CREATE POLICY "Users can view own submissions"
  ON public.student_exam_submissions FOR SELECT
  USING ( auth.uid() = user_id );

-- Students can insert their own submissions
DROP POLICY IF EXISTS "Users can insert own submissions" ON public.student_exam_submissions;
CREATE POLICY "Users can insert own submissions"
  ON public.student_exam_submissions FOR INSERT
  WITH CHECK ( auth.uid() = user_id );

-- Admin can view all submissions
DROP POLICY IF EXISTS "Admin can view all submissions" ON public.student_exam_submissions;
CREATE POLICY "Admin can view all submissions"
  ON public.student_exam_submissions FOR SELECT
  USING ( (auth.jwt() ->> 'email') = 'atoopase@gmail.com' );

-- Admin can delete submissions (to allow a student to retake)
DROP POLICY IF EXISTS "Admin can delete submissions" ON public.student_exam_submissions;
CREATE POLICY "Admin can delete submissions"
  ON public.student_exam_submissions FOR DELETE
  USING ( (auth.jwt() ->> 'email') = 'atoopase@gmail.com' );
