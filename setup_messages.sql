-- ============================================
-- NTC Exam Prep - Messages / Announcements Setup
-- ============================================

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references auth.users on delete cascade not null,
  content text not null,
  parent_id uuid references public.messages on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Anyone can view messages
DROP POLICY IF EXISTS "Anyone can view messages" ON public.messages;
CREATE POLICY "Anyone can view messages"
  ON public.messages FOR SELECT
  USING ( true );

-- Authenticated users can insert replies (parent_id is not null)
-- Allow admin to insert replies too
DROP POLICY IF EXISTS "Authenticated users can insert replies" ON public.messages;
CREATE POLICY "Authenticated users can insert replies"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id 
    AND parent_id IS NOT NULL 
    AND auth.role() = 'authenticated'
  );

-- Only admin can insert top-level announcements (parent_id is null)
DROP POLICY IF EXISTS "Admin can insert announcements" ON public.messages;
CREATE POLICY "Admin can insert announcements"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id 
    AND parent_id IS NULL
    AND (auth.jwt() ->> 'email') = 'atoopase@gmail.com'
  );

-- Admin can delete messages
DROP POLICY IF EXISTS "Admin can delete messages" ON public.messages;
CREATE POLICY "Admin can delete messages"
  ON public.messages FOR DELETE
  USING (
    (auth.jwt() ->> 'email') = 'atoopase@gmail.com'
  );

-- Create a view to easily fetch sender profile information
DROP VIEW IF EXISTS public.messages_with_profiles;
CREATE VIEW public.messages_with_profiles AS
SELECT 
  m.id,
  m.content,
  m.parent_id,
  m.created_at,
  p.id as sender_id,
  p.full_name as sender_name,
  p.avatar_url as sender_avatar
FROM public.messages m
LEFT JOIN public.profiles p ON m.sender_id = p.id;
