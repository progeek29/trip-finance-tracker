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
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS "cardNo" text`,
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

// Pass-number hash — MUST match src/utils/cards.ts + index.cjs mintCardNo.
function mintCardNo(seed) {
  const s = String(seed || '').trim().toLowerCase() || 'wandersync-guest';
  let h1 = 0, h2 = 0;
  for (let i = 0; i < s.length; i++) {
    h1 = (h1 * 31 + s.charCodeAt(i)) >>> 0;
    h2 = (h2 * 37 + s.charCodeAt(i) * 7) >>> 0;
  }
  const d = (String(h1).padStart(10, '0') + String(h2).padStart(10, '0')).slice(0, 14);
  return `WS${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6, 10)} ${d.slice(10, 14)}`;
}

// Backfill: every existing user gets a UNIQUE permanent pass number.
// Deterministic per email, collision-proofed with a counter suffix.
async function backfillCardNo(pool) {
  const { rows: missing } = await pool.query(
    `SELECT id, email FROM users WHERE "cardNo" IS NULL OR "cardNo" = ''`
  );
  if (missing.length === 0) {
    console.log('BACKFILL cardNo: none missing');
    return;
  }
  const { rows: taken } = await pool.query(
    `SELECT "cardNo" FROM users WHERE "cardNo" IS NOT NULL AND "cardNo" <> ''`
  );
  const used = new Set(taken.map((r) => r.cardNo));
  let n = 0;
  for (const u of missing) {
    const seed = (u.email || u.id || 'wandersync-guest');
    let card = mintCardNo(seed);
    for (let i = 1; used.has(card); i++) card = mintCardNo(`${seed}#${i}`);
    used.add(card);
    await pool.query('UPDATE users SET "cardNo" = $1 WHERE id = $2', [card, u.id]);
    n++;
  }
  console.log(`BACKFILL cardNo: ${n} users`);
}

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
  try {
    await backfillCardNo(pool);
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cardno ON users("cardNo")');
    console.log('OK: CREATE UNIQUE INDEX idx_users_cardno');
  } catch (e) {
    console.error('FAIL: cardNo backfill/index', e.message);
    process.exitCode = 1;
  }
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
