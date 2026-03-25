-- Run this in your Supabase project: SQL Editor → New Query → Paste → Run
-- This creates the profiles and assignments tables required by the Jarvis app

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  first_name TEXT DEFAULT '',
  last_name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  about_me TEXT DEFAULT '',
  profession TEXT DEFAULT '',
  interests JSONB DEFAULT '[]',
  likes JSONB DEFAULT '[]',
  dislikes JSONB DEFAULT '[]',
  communication_style TEXT DEFAULT 'friendly',
  response_length TEXT DEFAULT 'balanced',
  topics JSONB DEFAULT '[]',
  jarvis_name TEXT DEFAULT 'Jarvis',
  jarvis_tone TEXT DEFAULT 'professional',
  jarvis_style TEXT DEFAULT 'helpful',
  jarvis_traits JSONB DEFAULT '[]',
  jarvis_greeting TEXT DEFAULT '',
  study_plan JSONB,
  calendar_connected BOOLEAN DEFAULT FALSE,
  calendar_access_token TEXT,
  calendar_refresh_token TEXT,
  calendar_token_expiry TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if profiles table already exists with different schema
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS about_me TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS communication_style TEXT DEFAULT 'friendly';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS response_length TEXT DEFAULT 'balanced';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS topics JSONB DEFAULT '[]';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS jarvis_name TEXT DEFAULT 'Jarvis';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS jarvis_tone TEXT DEFAULT 'professional';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS jarvis_style TEXT DEFAULT 'helpful';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS jarvis_traits JSONB DEFAULT '[]';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS jarvis_greeting TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS study_plan JSONB;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendar_connected BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendar_access_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendar_refresh_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendar_token_expiry TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subject TEXT DEFAULT '',
  deadline TIMESTAMPTZ,
  priority TEXT DEFAULT 'medium',
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'not_started',
  steps JSONB DEFAULT '[]',
  calendar_event_id TEXT,
  calendar_reminder_event_ids JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT DEFAULT 'New Chat',
  pinned BOOLEAN DEFAULT FALSE,
  tags JSONB DEFAULT '[]',
  message_count INTEGER DEFAULT 0,
  last_message TEXT DEFAULT '',
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT,
  audio_base64 TEXT,
  function_calls JSONB DEFAULT '[]',
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  subject TEXT DEFAULT '',
  topic TEXT DEFAULT '',
  original_text TEXT DEFAULT '',
  transcript TEXT DEFAULT '',
  short_summary TEXT DEFAULT '',
  detailed_summary TEXT DEFAULT '',
  key_points JSONB DEFAULT '[]',
  qa JSONB DEFAULT '[]',
  flashcards JSONB DEFAULT '[]',
  flashcards_updated_at TIMESTAMPTZ,
  file_name TEXT DEFAULT '',
  file_type TEXT DEFAULT '',
  file_size INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure the columns required by /api/notes exist even if notes table was created earlier
ALTER TABLE notes ADD COLUMN IF NOT EXISTS subject TEXT DEFAULT '';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS topic TEXT DEFAULT '';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS original_text TEXT DEFAULT '';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS transcript TEXT DEFAULT '';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS short_summary TEXT DEFAULT '';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS detailed_summary TEXT DEFAULT '';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS key_points JSONB DEFAULT '[]';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS qa JSONB DEFAULT '[]';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS flashcards JSONB DEFAULT '[]';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS flashcards_updated_at TIMESTAMPTZ;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS file_name TEXT DEFAULT '';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS file_type TEXT DEFAULT '';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS file_size INTEGER DEFAULT 0;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE notes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add missing columns if chats table already exists with different schema
ALTER TABLE chats ADD COLUMN IF NOT EXISTS title TEXT DEFAULT 'New Chat';
ALTER TABLE chats ADD COLUMN IF NOT EXISTS last_message TEXT DEFAULT '';
ALTER TABLE chats ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE chats ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';
ALTER TABLE chats ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Disable RLS (backend handles auth via anon key)
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE assignments DISABLE ROW LEVEL SECURITY;
ALTER TABLE chats DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE notes DISABLE ROW LEVEL SECURITY;
