-- ============================================================
-- WanderSync — Supabase Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ─── TRIPS ──────────────────────────────────────────────────
create table if not exists trips (
  id text primary key,
  title text not null default '',
  description text default '',
  "coverImage" text default '',
  "startDate" text default '',
  "endDate" text default '',
  "totalBudget" numeric default 0,
  currency text default 'INR',
  "inviteCode" text unique,
  "ownerUid" text,
  cities jsonb default '[]',
  members jsonb default '[]',
  "isActive" boolean default false,
  status text default 'upcoming',
  "updatedAt" bigint,
  "createdAt" timestamptz default now()
);

-- ─── EXPENSES ───────────────────────────────────────────────
create table if not exists expenses (
  id text primary key,
  "tripId" text references trips(id) on delete cascade,
  "cityId" text,
  title text not null default '',
  amount numeric default 0,
  currency text default 'INR',
  category text default 'other',
  "paymentMode" text,
  "paidByMemberId" text,
  date text default '',
  time text default '',
  notes text default '',
  "isGroupExpense" boolean default false,
  splits jsonb default '[]',
  "isAutoParsedSMS" boolean default false,
  "originalSMS" text,
  "_deleted" boolean default false,
  "updatedAt" bigint,
  "createdAt" timestamptz default now()
);

-- ─── TODOS ──────────────────────────────────────────────────
create table if not exists todos (
  id text primary key,
  "tripId" text references trips(id) on delete cascade,
  title text not null default '',
  "assignedTo" text,
  done boolean default false,
  "updatedAt" bigint,
  "createdAt" timestamptz default now()
);

-- ─── DOCUMENTS ──────────────────────────────────────────────
create table if not exists documents (
  id text primary key,
  "tripId" text references trips(id) on delete cascade,
  title text default '',
  category text default 'other',
  "fileType" text default '',
  "fileUrl" text default '',
  "previewUrl" text default '',
  "fileSize" text default '',
  "referenceNumber" text default '',
  "uploadedAt" text default '',
  "uploadedByMemberId" text,
  tags jsonb default '[]',
  notes text default '',
  "_deleted" boolean default false,
  "updatedAt" bigint,
  "createdAt" timestamptz default now()
);

-- ─── CHAT MESSAGES ──────────────────────────────────────────
create table if not exists chat_messages (
  id text primary key,
  "tripId" text references trips(id) on delete cascade,
  type text default 'text',
  text text default '',
  lat numeric,
  lng numeric,
  "replyTo" jsonb,
  mentions jsonb default '[]',
  "senderId" text,
  "senderName" text default '',
  "createdAt" timestamptz default now()
);

-- ─── SIGNALS (siren) ────────────────────────────────────────
create table if not exists signals (
  id text primary key,
  "tripId" text references trips(id) on delete cascade,
  "byName" text,
  at bigint
);

-- ─── PRESENCE ───────────────────────────────────────────────
create table if not exists presence (
  id text primary key,  -- tripId_uid
  "tripId" text references trips(id) on delete cascade,
  uid text,
  name text default '',
  at bigint
);

-- ─── MEMBERS JOINED ─────────────────────────────────────────
create table if not exists members_joined (
  id text primary key,  -- tripId_uid
  "tripId" text references trips(id) on delete cascade,
  uid text,
  "joinedAt" timestamptz default now()
);

-- ─── PUSH TOKENS ────────────────────────────────────────────
create table if not exists push_tokens (
  id text primary key,  -- tripId_uid
  "tripId" text references trips(id) on delete cascade,
  uid text,
  token text
);

-- ─── INVITES ────────────────────────────────────────────────
create table if not exists invites (
  code text primary key,
  "tripId" text references trips(id) on delete cascade,
  "createdAt" timestamptz default now()
);

-- ─── INDEXES ────────────────────────────────────────────────
create index if not exists idx_expenses_trip on expenses("tripId");
create index if not exists idx_todos_trip on todos("tripId");
create index if not exists idx_documents_trip on documents("tripId");
create index if not exists idx_chat_trip on chat_messages("tripId");
create index if not exists idx_chat_created on chat_messages("tripId", "createdAt");
create index if not exists idx_signals_trip on signals("tripId");
create index if not exists idx_presence_trip on presence("tripId");
create index if not exists idx_tokens_trip on push_tokens("tripId");
create index if not exists idx_invites_code on invites(code);

-- ─── REALTIME (Supabase-only, skip for local PostgreSQL) ─────
-- alter publication supabase_realtime add table chat_messages;
-- alter publication supabase_realtime add table signals;
-- alter publication supabase_realtime add table presence;

-- ─── USERS ──────────────────────────────────────────────────
create table if not exists users (
  id text primary key,
  email text unique not null,
  name text default '',
  phone text default '',
  role text default 'user',
  password_hash text default '',
  "createdAt" timestamptz default now()
);

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────
-- Disable RLS (app handles auth client-side)
-- Only needed if RLS was previously enabled; safe to skip on fresh local DB
DO $$ BEGIN
  ALTER TABLE trips DISABLE ROW LEVEL SECURITY;
  ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
  ALTER TABLE todos DISABLE ROW LEVEL SECURITY;
  ALTER TABLE documents DISABLE ROW LEVEL SECURITY;
  ALTER TABLE chat_messages DISABLE ROW LEVEL SECURITY;
  ALTER TABLE signals DISABLE ROW LEVEL SECURITY;
  ALTER TABLE presence DISABLE ROW LEVEL SECURITY;
  ALTER TABLE members_joined DISABLE ROW LEVEL SECURITY;
  ALTER TABLE push_tokens DISABLE ROW LEVEL SECURITY;
  ALTER TABLE invites DISABLE ROW LEVEL SECURITY;
  ALTER TABLE users DISABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
