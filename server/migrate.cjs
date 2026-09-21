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
  // P1 identity: @handle for search/QR + gender for search icons/profile.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS username text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS gender text DEFAULT 'unspecified'`,
  // Google sign-on: stable subject id (never trust email alone for linking).
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub text`,
  // Email verification flag (password users verify via Brevo OTP; Google
  // users are verified by definition).
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean DEFAULT false`,
  // OTP codes: hashed, purpose-tagged, short-lived. Attempts capped.
  `CREATE TABLE IF NOT EXISTS email_otps (
    id text primary key,
    email text not null,
    purpose text not null,
    code_hash text not null,
    expires_at bigint not null,
    attempts smallint default 0,
    consumed boolean default false,
    "createdAt" bigint
  )`,
  `CREATE INDEX IF NOT EXISTS idx_otps_email ON email_otps(email, purpose)`,
  // Single-use reset tokens (OTP-verified): exchange for a password write.
  `CREATE TABLE IF NOT EXISTS password_resets (
    token text primary key,
    email text not null,
    expires_at bigint not null,
    consumed boolean default false,
    "createdAt" bigint
  )`,
  // Tiny KV for housekeeping (Brevo last-send timestamp for the heartbeat).
  `CREATE TABLE IF NOT EXISTS app_meta (
    key text primary key,
    value text default ''
  )`,
  // Blogs (P1): long-form travel stories. status: draft → pending →
  // published (admin approves) / rejected. featured = login-page cards.
  `CREATE TABLE IF NOT EXISTS blog_posts (
    id text primary key,
    author_uid text not null references users(id) on delete cascade,
    title text default '',
    slug text,
    body text default '',
    cover_url text default '',
    tag text default 'journal',
    status text default 'draft',
    featured boolean default false,
    views bigint default 0,
    "createdAt" bigint,
    "updatedAt" bigint
  )`,
  `CREATE INDEX IF NOT EXISTS idx_blogs_status ON blog_posts(status, "updatedAt" DESC)`,
  // Featured order (admin up/down arrows on login cards).
  `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_blogs_slug ON blog_posts(slug) WHERE slug IS NOT NULL AND slug <> ''`,
  // Blog likes + comments (same relational pattern as moments).
  `CREATE TABLE IF NOT EXISTS blog_likes (
    "blogId" text not null references blog_posts(id) on delete cascade,
    uid text not null references users(id) on delete cascade,
    at bigint,
    PRIMARY KEY ("blogId", uid)
  )`,
  `CREATE TABLE IF NOT EXISTS blog_comments (
    id text primary key,
    "blogId" text not null references blog_posts(id) on delete cascade,
    uid text not null references users(id) on delete cascade,
    name text default '',
    text text default '',
    at bigint
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bcomments_blog ON blog_comments("blogId", at)`,
  // Moments embedded at the end of blogs (own moments, own blogs only —
  // enforced in the endpoint by matching session uid on both sides).
  `CREATE TABLE IF NOT EXISTS blog_moments (
    "blogId" text not null references blog_posts(id) on delete cascade,
    "photoId" text not null references photos(id) on delete cascade,
    at bigint,
    PRIMARY KEY ("blogId", "photoId")
  )`,
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
  // Timeline moments: metadata + compressed bytes IN the DB (single store —
  // visible from any device, counted in live DB usage). ~80KB/photo.
  `CREATE TABLE IF NOT EXISTS photos (
    id text primary key,
    "tripId" text references trips(id) on delete cascade,
    url text default '',
    caption text default '',
    "locationTag" text default '',
    "uploadedByMemberId" text,
    "uploadedByName" text default '',
    "uploadedAt" text default '',
    "likesCount" numeric default 0,
    "storagePath" text default '',
    mime text default 'image/jpeg',
    data bytea,
    "_deleted" boolean default false,
    "updatedAt" bigint,
    "updatedBy" text,
    "createdAt" timestamptz default now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_photos_trip ON photos("tripId")`,
  // Feed frame aspect (w/h) saved at post — frame matches crop exactly.
  `ALTER TABLE photos ADD COLUMN IF NOT EXISTS aspect numeric`,
  // Author UID on moments: display names resolve LIVE from trip members,
  // so a profile rename propagates everywhere (never frozen at post time).
  `ALTER TABLE photos ADD COLUMN IF NOT EXISTS "uploadedByUid" text`,
  // Blog cover uploads (BlogComposer "Upload new"): dedicated trip-less
  // moments that must NOT leak into the main feed / My-posts grid as
  // standalone posts. Covers render only inside their blog (cover_url).
  `ALTER TABLE photos ADD COLUMN IF NOT EXISTS is_cover boolean DEFAULT false`,
  // Chat requests: pending → accepted/declined (silent) ; sender-cancel deletes.
  // Friendship = accepted pair either direction. Block list reserved (P3).
  `CREATE TABLE IF NOT EXISTS chat_requests (
    id text primary key,
    "fromUid" text not null references users(id) on delete cascade,
    "toUid" text not null references users(id) on delete cascade,
    status text default 'pending',
    "createdAt" bigint,
    "updatedAt" bigint
  )`,
  `CREATE INDEX IF NOT EXISTS idx_requests_to ON chat_requests("toUid", status)`,
  `CREATE INDEX IF NOT EXISTS idx_requests_from ON chat_requests("fromUid", status)`,
  // Friend groups: explicit member list (any member opens the same room id).
  `CREATE TABLE IF NOT EXISTS chat_groups (
    id text primary key,
    "memberUids" jsonb,
    "createdBy" text references users(id) on delete cascade,
    "createdAt" bigint
  )`,
  // Chat rooms are first-class (trips, 1:1 DMs, groups) — a tripId FK would
  // reject every DM/group message. Quoted identifier is MANDATORY here:
  // unquoted folds to lowercase and IF EXISTS silently no-ops (bit us live).
  `ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS "chat_messages_tripId_fkey"`,
  `CREATE INDEX IF NOT EXISTS idx_groups_created ON chat_groups("createdBy")`,
  // Group display name (any member can rename, WhatsApp-style).
  `ALTER TABLE chat_groups ADD COLUMN IF NOT EXISTS name text DEFAULT ''`,
  // Post comments (main + trip timelines): text only, author from session.
  `CREATE TABLE IF NOT EXISTS photo_comments (
    id text primary key,
    "photoId" text not null references photos(id) on delete cascade,
    uid text not null references users(id) on delete cascade,
    name text default '',
    text text default '',
    at bigint
  )`,
  `CREATE INDEX IF NOT EXISTS idx_comments_photo ON photo_comments("photoId", at)`,
  // Relational likes (toggle truth): one row per (photo, user).
  // Insert on like, delete on unlike — never a blind counter column.
  `CREATE TABLE IF NOT EXISTS photo_likes (
    "photoId" text not null references photos(id) on delete cascade,
    uid text not null references users(id) on delete cascade,
    at bigint,
    PRIMARY KEY ("photoId", uid)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_likes_photo ON photo_likes("photoId")`,
  `CREATE INDEX IF NOT EXISTS idx_likes_uid ON photo_likes(uid)`,
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

// Backfill: every existing user gets a UNIQUE permanent @handle.
// Deterministic per (name, id), collision-proofed with a `#i` seed suffix
// (same `name_xxxx` format, fresh suffix each try).
function mintUsernameBackfill(name, seed) {
  const slug =
    String(name || '').trim().toLowerCase().split(/\s+/)[0]
      ?.replace(/[^a-z0-9]/g, '').slice(0, 8) || 'friend';
  const s = `${slug}|${String(seed || '').trim().toLowerCase() || 'wandersync-guest'}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h * 31 + s.charCodeAt(i)) >>> 0);
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let suffix = '';
  let n = h;
  for (let i = 0; i < 4; i++) {
    suffix += alphabet[n % alphabet.length];
    n = Math.floor(n / alphabet.length);
  }
  return `${slug}_${suffix}`;
}
async function backfillUsername(pool) {
  const { rows: missing } = await pool.query(
    `SELECT id, name FROM users WHERE username IS NULL OR username = ''`
  );
  if (missing.length === 0) {
    console.log('BACKFILL username: none missing');
    return;
  }
  const { rows: taken } = await pool.query(
    `SELECT username FROM users WHERE username IS NOT NULL AND username <> ''`
  );
  const used = new Set(taken.map((r) => String(r.username).toLowerCase()));
  let n = 0;
  for (const u of missing) {
    const seed = u.id || 'wandersync-guest';
    let handle = mintUsernameBackfill(u.name, seed);
    for (let i = 1; used.has(handle.toLowerCase()); i++) {
      handle = mintUsernameBackfill(u.name, `${seed}#${i}`);
    }
    used.add(handle.toLowerCase());
    await pool.query('UPDATE users SET username = $1 WHERE id = $2', [handle, u.id]);
    n++;
  }
  console.log(`BACKFILL username: ${n} users`);
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
    await backfillUsername(pool);
    await pool.query('UPDATE users SET gender = $1 WHERE gender IS NULL OR gender = $2', ['unspecified', '']);
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username))');
    console.log('OK: CREATE UNIQUE INDEX idx_users_username_lower');
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users (google_sub) WHERE google_sub IS NOT NULL AND google_sub <> ' + "''");
    console.log('OK: CREATE UNIQUE INDEX idx_users_google_sub');
  } catch (e) {
    console.error('FAIL: cardNo/username backfill/index', e.message);
    process.exitCode = 1;
  }
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
