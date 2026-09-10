// One-time migration: columns the client already sends/expects.
// Run: node server/migrate.cjs
const pool = require('./db.cjs');

const STMTS = [
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    token text primary key,
    "userId" text not null references users(id) on delete cascade,
    "createdAt" timestamptz default now()
  )`,
  `UPDATE trips SET "ownerUid" = NULLIF(members->0->>'uid', '')
   WHERE "ownerUid" IS NULL AND jsonb_typeof(members) = 'array'`,
  `DO $$ BEGIN
     IF EXISTS (SELECT 1 FROM trips WHERE "ownerUid" IS NULL) THEN
       RAISE EXCEPTION 'Cannot enforce trip ownership: one or more trips have no ownerUid';
     END IF;
     ALTER TABLE trips ALTER COLUMN "ownerUid" SET NOT NULL;
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$`,
  `DO $$ BEGIN
     ALTER TABLE trips ADD CONSTRAINT trips_owner_uid_fkey
       FOREIGN KEY ("ownerUid") REFERENCES users(id) ON DELETE RESTRICT;
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$`,
  `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "updatedBy" text`,
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS "updatedBy" text`,
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS "remoteUrl" text`,
  `ALTER TABLE todos ADD COLUMN IF NOT EXISTS text text`,
  `ALTER TABLE todos ADD COLUMN IF NOT EXISTS _deleted boolean DEFAULT false`,
  `ALTER TABLE todos ADD COLUMN IF NOT EXISTS "updatedBy" text`,
  `ALTER TABLE todos ADD COLUMN IF NOT EXISTS "ownerUid" text`,
  `CREATE TABLE IF NOT EXISTS settlements (
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
  )`,
  `CREATE TABLE IF NOT EXISTS expense_events (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_settlements_trip ON settlements("tripId")`,
  `CREATE INDEX IF NOT EXISTS idx_expense_events_trip ON expense_events("tripId")`,
  `ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS pinned boolean DEFAULT false`,
  `ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS "_deleted" boolean DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS message_reads (
    "messageId" text,
    "tripId" text references trips(id) on delete cascade,
    uid text,
    at bigint,
    PRIMARY KEY ("messageId", uid)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_reads_trip ON message_reads("tripId")`,
];

(async () => {
  for (const sql of STMTS) {
    try {
      await pool.query(sql);
      console.log('OK:', sql);
    } catch (e) {
      console.error('FAIL:', sql, e.message);
      process.exitCode = 1;
    }
  }
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
