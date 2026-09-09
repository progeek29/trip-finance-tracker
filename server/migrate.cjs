// One-time migration: columns the client already sends/expects.
// Run: node server/migrate.cjs
const pool = require('./db.cjs');

const STMTS = [
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
