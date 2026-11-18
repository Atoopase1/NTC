-- ============================================================
-- PrepTrack - Add Class Name & Week to Attendance Management
-- Run this script in the Supabase SQL Editor if you want native
-- class_name and week columns in your database.
-- Note: The frontend works seamlessly with or without this migration!
-- ============================================================

ALTER TABLE public.attendance_sessions 
  ADD COLUMN IF NOT EXISTS class_name TEXT DEFAULT 'Class A',
  ADD COLUMN IF NOT EXISTS week TEXT DEFAULT 'Week 1';

ALTER TABLE public.attendance_submissions 
  ADD COLUMN IF NOT EXISTS class_name TEXT,
  ADD COLUMN IF NOT EXISTS week TEXT;

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_class_week 
  ON public.attendance_sessions(class_name, week);
