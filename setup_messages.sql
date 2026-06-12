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

-- Any logged-in user can insert a reply (parent_id IS NOT NULL)
DROP POLICY IF EXISTS "Authenticated users can insert replies" ON public.messages;
CREATE POLICY "Authenticated users can insert replies"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND parent_id IS NOT NULL
    AND auth.uid() IS NOT NULL
  );

-- Admin can insert top-level announcements (parent_id IS NULL)
DROP POLICY IF EXISTS "Admin can insert announcements" ON public.messages;
CREATE POLICY "Admin can insert announcements"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND (auth.jwt() ->> 'email') = 'atoopase@gmail.com'
  );

-- Users can update their own messages
DROP POLICY IF EXISTS "Users can update own messages" ON public.messages;
CREATE POLICY "Users can update own messages"
  ON public.messages FOR UPDATE
  USING ( auth.uid() = sender_id )
  WITH CHECK ( auth.uid() = sender_id );

-- Users can delete their own messages
DROP POLICY IF EXISTS "Users can delete own messages" ON public.messages;
CREATE POLICY "Users can delete own messages"
  ON public.messages FOR DELETE
  USING ( auth.uid() = sender_id );

-- Admin can delete anyone's messages
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
  null as sender_avatar
FROM public.messages m
JOIN public.profiles p ON m.sender_id = p.id;

-- ============================================
-- Reactions System
-- ============================================

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid default gen_random_uuid() primary key,
  message_id uuid references public.messages on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  is_like boolean not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  UNIQUE(message_id, user_id)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Anyone can view reactions
DROP POLICY IF EXISTS "Anyone can view reactions" ON public.message_reactions;
CREATE POLICY "Anyone can view reactions"
  ON public.message_reactions FOR SELECT
  USING ( true );

-- Authenticated users can insert their own reactions
DROP POLICY IF EXISTS "Auth users can insert reactions" ON public.message_reactions;
CREATE POLICY "Auth users can insert reactions"
  ON public.message_reactions FOR INSERT
  WITH CHECK ( auth.uid() = user_id );

-- Authenticated users can update their own reactions
DROP POLICY IF EXISTS "Auth users can update reactions" ON public.message_reactions;
CREATE POLICY "Auth users can update reactions"
  ON public.message_reactions FOR UPDATE
  USING ( auth.uid() = user_id );

-- Authenticated users can delete their own reactions
DROP POLICY IF EXISTS "Auth users can delete reactions" ON public.message_reactions;
CREATE POLICY "Auth users can delete reactions"
  ON public.message_reactions FOR DELETE
  USING ( auth.uid() = user_id );
