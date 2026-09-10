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
  "ownerUid" text not null,
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
  "updatedBy" text,
  "createdAt" timestamptz default now()
);

-- ─── TODOS ──────────────────────────────────────────────────
create table if not exists todos (
  id text primary key,
  "tripId" text references trips(id) on delete cascade,
  title text not null default '',
  text text default '',
  "assignedTo" text,
  done boolean default false,
  "_deleted" boolean default false,
  "ownerUid" text,
  "updatedAt" bigint,
  "updatedBy" text,
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
  "remoteUrl" text,
  "_deleted" boolean default false,
  "updatedAt" bigint,
  "updatedBy" text,
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
  pinned boolean default false,
  "_deleted" boolean default false,
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

-- ─── SETTLEMENTS (balance ledger only — never touches spend) ──
create table if not exists settlements (
  id text primary key,
  "tripId" text references trips(id) on delete cascade,
  "fromMemberId" text,
  "toMemberId" text,
  amount numeric default 0,
  date text default '',
  note text default '',
  "_deleted" boolean default false,
  "updatedAt" bigint,
  "updatedBy" text,
  "createdAt" timestamptz default now()
);

-- ─── EXPENSE EVENTS (transparent edit history, immutable) ───
create table if not exists expense_events (
  id text primary key,
  "tripId" text references trips(id) on delete cascade,
  "expenseId" text,
  action text default 'created',
  title text default '',
  amount numeric default 0,
  "byUid" text,
  "byName" text default '',
  at bigint,
  "createdAt" timestamptz default now()
);

-- ─── MESSAGE READS (per-message read receipts) ────────────
create table if not exists message_reads (
  "messageId" text,
  "tripId" text references trips(id) on delete cascade,
  uid text,
  at bigint,
  primary key ("messageId", uid)
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
create index if not exists idx_settlements_trip on settlements("tripId");
create index if not exists idx_expense_events_trip on expense_events("tripId");
create index if not exists idx_reads_trip on message_reads("tripId");

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

-- Random server sessions. A session token is never a user ID and is never in a URL.
create table if not exists auth_sessions (
  token text primary key,
  "userId" text not null references users(id) on delete cascade,
  "createdAt" timestamptz default now()
);

-- A user cannot be deleted while they own a trip. Reassign ownership first.
DO $$ BEGIN
  ALTER TABLE trips
    ADD CONSTRAINT trips_owner_uid_fkey
    FOREIGN KEY ("ownerUid") REFERENCES users(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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
  ALTER TABLE settlements DISABLE ROW LEVEL SECURITY;
  ALTER TABLE expense_events DISABLE ROW LEVEL SECURITY;
  ALTER TABLE message_reads DISABLE ROW LEVEL SECURITY;
  ALTER TABLE users DISABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
