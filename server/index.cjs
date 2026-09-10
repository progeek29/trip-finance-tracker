const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const http = require('http');
const { Server } = require('socket.io');
const pool = require('./db.cjs');

const app = express();
function bearerToken(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query('INSERT INTO auth_sessions (token, "userId") VALUES ($1, $2)', [token, userId]);
  return token;
}

async function requireSession(req, res, next) {
  try {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ data: null, error: 'Authentication required' });
    const { rows } = await pool.query(
      'SELECT u.id, u.email, u.name, u.phone, u.role FROM auth_sessions s JOIN users u ON u.id = s."userId" WHERE s.token = $1',
      [token]
    );
    if (rows.length === 0) return res.status(401).json({ data: null, error: 'Session expired. Please login again.' });
    req.user = rows[0];
    next();
  } catch (e) {
    res.status(500).json({ data: null, error: e.message });
  }
}
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── Specific routes FIRST (before generic /:table) ────────

// Root (platform health checks) + API health check
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'wandersync-api' });
});

// Friendly API root response; endpoint clients should use /api/health for DB status.
app.get('/api', (req, res) => {
  res.json({ ok: true, service: 'wandersync-api', health: '/api/health' });
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT NOW()');
    res.json({ ok: true, time: rows[0].now });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ─── Closed-app voice: short-TTL clip store + offline-only FCM fan-out ──
// Memory-only by design (zero DB load): clips vanish after 5 min / restart.
// Online members hear bursts live over socket; FCM goes ONLY to offline ones,
// so per burst cost = 1 indexed token query + a few small HTTPS calls.
const voiceClips = new Map(); // clipId -> { tripId, voiceUrl, senderUid, senderName, apiBase, at, expires }
const VOICE_CLIP_TTL_MS = 5 * 60 * 1000;
const VOICE_CLIP_MAX = 50;
function sweepVoiceClips() {
  const now = Date.now();
  for (const [id, c] of voiceClips) if (c.expires <= now) voiceClips.delete(id);
  while (voiceClips.size > VOICE_CLIP_MAX) voiceClips.delete(voiceClips.keys().next().value);
}
setInterval(sweepVoiceClips, 60 * 1000).unref();

// POST /api/voice-clips — sender uploads right after the socket burst (fire-and-forget)
app.post('/api/voice-clips', async (req, res) => {
  try {
    const { clipId, tripId, voiceUrl, senderUid, senderName, apiBase } = req.body || {};
    if (!tripId || !voiceUrl) return res.status(400).json({ data: null, error: 'tripId and voiceUrl required' });
    const id = ingestVoiceClip({ clipId, tripId, voiceUrl, senderUid, senderName, apiBase });
    res.json({ data: { clipId: id }, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: e.message });
  }
});

// Single ingest path for socket bursts AND POST uploads (deduped by clipId,
// so a burst arriving over both channels fans out exactly once).
const fannedClips = new Set();
function cleanApiBase(v) {
  return typeof v === 'string' && /^https?:\/\//.test(v) ? v.replace(/\/$/, '') : null;
}
function ingestVoiceClip({ clipId, tripId, voiceUrl, senderUid, senderName, apiBase }) {
  sweepVoiceClips();
  const id = (typeof clipId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(clipId))
    ? clipId
    : crypto.randomBytes(12).toString('hex');
  const isNew = !voiceClips.has(id);
  voiceClips.set(id, {
    tripId: String(tripId),
    voiceUrl: String(voiceUrl).slice(0, 8 * 1024 * 1024),
    senderUid: senderUid || null,
    senderName: senderName || 'Someone',
    apiBase: cleanApiBase(apiBase),
    at: Date.now(),
    expires: Date.now() + VOICE_CLIP_TTL_MS,
  });
  // Fan-out runs async — never blocks the sender.
  void fanOutVoiceClip(id);
  if (isNew) console.log(`voice clip stored: trip ${String(tripId)} sender ${senderUid || '?'} clip ${id}`);
  return id;
}

// GET /api/voice-clips/latest?tripId=&since= — tap-to-open fallback play inside the app
// (registered BEFORE /:id — Express matches in registration order)
app.get('/api/voice-clips/latest', (req, res) => {
  const tid = String(req.query.tripId || '');
  const since = Number(req.query.since || 0);
  let best = null;
  for (const [id, c] of voiceClips) {
    if (c.tripId !== tid || c.expires <= Date.now() || c.at < since) continue;
    if (!best || c.at > best.at) best = { clipId: id, voiceUrl: c.voiceUrl, senderName: c.senderName, at: c.at };
  }
  res.json({ data: best, error: null });
});

// GET /api/voice-clips/:id — native service downloads the clip (410 = expired)
app.get('/api/voice-clips/:id', (req, res) => {
  const c = voiceClips.get(req.params.id);
  if (!c || c.expires <= Date.now()) {
    if (c) voiceClips.delete(req.params.id);
    return res.status(410).json({ data: null, error: 'clip expired' });
  }
  res.json({ data: { tripId: c.tripId, voiceUrl: c.voiceUrl, senderName: c.senderName, at: c.at }, error: null });
});

// ─── FCM sender (raw HTTP v1, no new deps) ───
let fcmCreds = null; // { projectId, clientEmail, privateKey } | false (missing)
let fcmCredsWarned = false;
let fcmOAuth = null;
let fcmOAuthExp = 0;
function loadFcmCreds() {
  if (fcmCreds !== null) return fcmCreds || null;
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT
      || (process.env.FIREBASE_SERVICE_ACCOUNT_FILE
        ? require('fs').readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_FILE, 'utf8')
        : null);
    if (!raw) { fcmCreds = false; return null; }
    const sa = JSON.parse(raw);
    if (!sa.project_id || !sa.client_email || !sa.private_key) { fcmCreds = false; return null; }
    fcmCreds = { projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key };
    return fcmCreds;
  } catch {
    fcmCreds = false;
    return null;
  }
}
function b64urlJson(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function fcmAccessToken() {
  const creds = loadFcmCreds();
  if (!creds) return null;
  if (fcmOAuth && Date.now() < fcmOAuthExp) return fcmOAuth;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64urlJson({ alg: 'RS256', typ: 'JWT' }) + '.' + b64urlJson({
    iss: creds.clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), crypto.createPrivateKey(creds.privateKey));
  const jwt = unsigned + '.' + sig.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('fcm oauth failed');
  fcmOAuth = j.access_token;
  fcmOAuthExp = Date.now() + 55 * 60 * 1000;
  return fcmOAuth;
}

async function fanOutVoiceClip(clipId) {
  try {
    const c = voiceClips.get(clipId);
    if (!c) return;
    if (fannedClips.has(clipId)) return; // socket + POST both arrived — send once
    fannedClips.add(clipId);
    if (fannedClips.size > 200) fannedClips.delete(fannedClips.values().next().value);
    // Online = live socket members of this trip (they already heard it).
    const members = typeof roomMembers !== 'undefined' ? roomMembers.get(c.tripId) : null;
    const online = new Set(members ? [...members.values()].map((m) => m.uid).filter(Boolean) : []);
    const { rows } = await pool.query('SELECT uid, token FROM push_tokens WHERE "tripId" = $1', [c.tripId]);
    const targets = rows.filter((r) => r.token && r.uid !== c.senderUid && !online.has(r.uid));
    console.log(`voice fan-out check: trip ${c.tripId} tokens=${rows.length} online=${online.size} [${[...online].join(',')}] targets=${targets.length}`);
    if (!targets.length) return;
    // Trip title for the alert (cheap indexed read, only when pushing).
    let tripTitle = 'Trip';
    try {
      const tr = await pool.query('SELECT title FROM trips WHERE id = $1', [c.tripId]);
      if (tr.rows.length && tr.rows[0].title) tripTitle = String(tr.rows[0].title).slice(0, 60);
    } catch { /* title optional */ }
    const creds = loadFcmCreds();
    if (!creds) {
      if (!fcmCredsWarned) {
        fcmCredsWarned = true;
        console.warn('voice FCM skipped: set FIREBASE_SERVICE_ACCOUNT (inline JSON) or FIREBASE_SERVICE_ACCOUNT_FILE');
      }
      return;
    }
    const access = await fcmAccessToken();
    if (!access) return;
    let sent = 0;
    await Promise.all(targets.map(async (t) => {
      try {
        // ROOT CAUSE (proven by A/B tests on-device): any `data` block in the
        // FCM payload kills delivery on this device/profile (Google 200-accepts,
        // GMS never dispatches — FcmRetry loop). Notification-only arrives
        // instantly. So: alert via notification (proven channel), audio pulled
        // by the app on open (clip holds 5 min server-side). Data-path native
        // code stays dormant until data delivery is proven working again.
        const payload = {
          message: {
            token: t.token,
            notification: { title: `${c.senderName} • voice in ${tripTitle}`, body: 'Tap to open & listen' },
            android: {
              priority: 'high',
              ttl: '300s',
              notification: { channel_id: 'wandersync_voice', sound: 'default' },
            },
          },
        };
        console.log('voice FCM to:', String(t.token).slice(0, 12) + '…');
        const r = await fetch(`https://fcm.googleapis.com/v1/projects/${creds.projectId}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const rb = await r.text();
        console.log('voice FCM resp:', r.status, rb.slice(0, 200));
        let ok = false;
        try {
          ok = r.ok && !!JSON.parse(rb).name;
        } catch { /* non-JSON */ }
        if (ok) sent++;
      } catch { /* per-device fail, skip */ }
    }));
    console.log(`voice FCM: ${sent}/${targets.length} offline (trip ${c.tripId})`);
  } catch (e) {
    console.error('voice fan-out error:', e.message);
  }
}

// Auth: signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;
    if (!email || !password) return res.json({ data: null, error: 'Email and password required' });

    const { rows: existing } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.length > 0) return res.json({ data: null, error: 'User already exists' });

    const id = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const hash = await bcrypt.hash(password, 10);
    const role = email === 'admin@wandersync.com' ? 'admin' : 'user';

    await pool.query(
      'INSERT INTO users (id, email, name, phone, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, email, name || '', phone || '', role, hash]
    );

    const token = await createSession(id);
    res.json({ data: { user: { id, email }, token }, error: null });
  } catch (e) {
    console.error('Signup error:', e.message);
    res.json({ data: null, error: e.message });
  }
});

// Auth: signin
app.post('/api/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.json({ data: null, error: 'Email and password required' });

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (rows.length === 0) return res.json({ data: null, error: 'Invalid email or password' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash || '');
    if (!valid) return res.json({ data: null, error: 'Invalid email or password' });

    const token = await createSession(user.id);
    res.json({ data: { user: { id: user.id, email: user.email }, token }, error: null });
  } catch (e) {
    console.error('Signin error:', e.message);
    res.json({ data: null, error: e.message });
  }
});

// Auth: get current user
app.get('/api/auth/user', async (req, res) => {
  try {
    const token = bearerToken(req);
    if (!token) return res.json({ data: { user: null }, error: null });

    const { rows } = await pool.query(
      'SELECT u.id, u.email, u.name, u.phone, u.role FROM auth_sessions s JOIN users u ON u.id = s."userId" WHERE s.token = $1',
      [token]
    );
    if (rows.length === 0) return res.json({ data: { user: null }, error: null });

    res.json({ data: { user: rows[0] }, error: null });
  } catch (e) {
    res.json({ data: { user: null }, error: e.message });
  }
});

// ─── User directory + password management ────────

function normPhone(p) {
  return String(p || '').replace(/\D/g, '').slice(-10);
}

async function requireAdmin(adminId) {
  if (!adminId) return null;
  const { rows } = await pool.query('SELECT id, email, role FROM users WHERE id = $1', [adminId]);
  const admin = rows[0];
  if (!admin || admin.role !== 'admin') return null;
  return admin;
}

// GET /api/users — user directory WITHOUT password hashes
// (must stay before the generic /:table route)
app.get('/api/users', requireSession, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, name, phone, role, "createdAt" FROM users ORDER BY email'
    );
    res.json({ data: rows, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// POST /api/auth/forgot-password — self-service reset for the current account.
// MVP flow: email + new password only. OTP/mobile verification is planned later.
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const rawEmail = String(req.body?.email ?? req.body?.id ?? '').trim();
    const rawPassword = req.body?.newPassword ?? req.body?.password;
    const email = rawEmail.toLowerCase();

    if (!email) return res.json({ data: null, error: 'Email is required' });
    if (!rawPassword || String(rawPassword).trim().length < 6) {
      return res.json({ data: null, error: 'New password must be at least 6 characters' });
    }

    const { rows } = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (rows.length === 0) return res.json({ data: null, error: 'No account found with this email' });

    const hash = await bcrypt.hash(String(rawPassword), 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, rows[0].id]);
    res.json({ data: { ok: true }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// POST /api/admin/create-user — admin creates a login-ready user (hashed server-side)
app.post('/api/admin/create-user', async (req, res) => {
  try {
    const { adminId, email, password, name, phone, role } = req.body;
    if (!await requireAdmin(adminId)) return res.json({ data: null, error: 'Admin access required' });
    if (!email || !password) return res.json({ data: null, error: 'Email and password required' });
    if (password.length < 6) return res.json({ data: null, error: 'Password must be at least 6 characters' });

    const safeRole = ['user', 'owner', 'admin'].includes(role) ? role : 'user';
    const { rows: existing } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.length > 0) return res.json({ data: null, error: 'User already exists' });

    const id = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (id, email, name, phone, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, email, name || '', phone || '', safeRole, hash]
    );
    res.json({ data: [{ id, email, name: name || '', phone: phone || '', role: safeRole }], error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// POST /api/admin/reset-password — admin sets a new password for any user
// (passwords are bcrypt hashes: nobody, not even admin, can SEE a password)
app.post('/api/admin/reset-password', async (req, res) => {
  try {
    const { adminId, userId, newPassword } = req.body;
    if (!await requireAdmin(adminId)) return res.json({ data: null, error: 'Admin access required' });
    if (!userId || !newPassword || newPassword.length < 6) {
      return res.json({ data: null, error: 'Valid user and 6+ character password required' });
    }
    const { rows } = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (rows.length === 0) return res.json({ data: null, error: 'User not found' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
    res.json({ data: { ok: true }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// POST /api/admin/delete-user — admin deletes a user + their owned trips (refuses self-delete)
app.post('/api/admin/delete-user', async (req, res) => {
  try {
    const { adminId, userId } = req.body;
    const admin = await requireAdmin(adminId);
    if (!admin) return res.json({ data: null, error: 'Admin access required' });
    if (!userId) return res.json({ data: null, error: 'User required' });
    if (userId === admin.id) return res.json({ data: null, error: 'You cannot delete your own admin account' });

    const { rows: ownedTrips } = await pool.query('SELECT id FROM trips WHERE "ownerUid" = $1 LIMIT 1', [userId]);
    if (ownedTrips.length > 0) {
      return res.json({ data: null, error: 'User owns trips. Reassign ownership before deleting this user.' });
    }
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ data: { ok: true }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// ─── Generic table CRUD (AFTER specific routes) ────────────

app.use('/api/:table', requireSession);

// GET /api/:table — list rows with optional filters
app.get('/api/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const { single, order, ascending, ...filters } = req.query;

    let sql = `SELECT * FROM ${table}`;
    const vals = [];
    const conds = [];
    let i = 1;

    for (const [col, val] of Object.entries(filters)) {
      conds.push(`"${col}" = $${i}`);
      vals.push(val);
      i++;
    }
    if (conds.length) sql += ` WHERE ${conds.join(' AND ')}`;
    if (order) sql += ` ORDER BY "${order}" ${ascending === 'false' ? 'DESC' : 'ASC'}`;
    if (single === 'true') sql += ` LIMIT 1`;

    const { rows } = await pool.query(sql, vals);
    res.json({ data: single === 'true' ? (rows[0] || null) : rows, error: null });
  } catch (e) {
    console.error('GET error:', e.message);
    res.json({ data: null, error: e.message });
  }
});

// POST /api/:table — upsert
app.post('/api/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const body = req.body;
    // Same rule as PUT: password hashes never enter via generic upsert.
    const rows = Array.isArray(body) ? body : [body];
    if (table === 'users') {
      for (const r of rows) delete r.password_hash;
    }
    if (rows.length === 0) return res.json({ data: [], error: null });

    const cols = Object.keys(rows[0]);
    const colList = cols.map((c) => `"${c}"`).join(', ');

    const placeholders = rows.map((_, ri) =>
      `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`
    ).join(', ');

    const updateSet = cols.filter(c => c !== 'id' && c !== 'code').map((c) =>
      `"${c}" = EXCLUDED."${c}"`
    ).join(', ');

    const conflictCol = table === 'invites' ? 'code' : 'id';
    const sql = `INSERT INTO ${table} (${colList}) VALUES ${placeholders}
      ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updateSet || `${cols[0]} = EXCLUDED.${cols[0]}`}`;

    // Serialize objects/arrays for jsonb columns
    const jsonbCols = ['cities', 'members', 'splits', 'tags', 'mentions', 'replyTo', 'files'];
    const vals = rows.flatMap((r) => cols.map((c) => {
      const v = r[c] ?? null;
      if (jsonbCols.includes(c) && v !== null && typeof v === 'object') return JSON.stringify(v);
      return v;
    }));
    const { rows: result } = await pool.query(sql, vals);
    res.json({ data: result, error: null });
  } catch (e) {
    console.error('POST error:', e.message);
    res.json({ data: null, error: e.message });
  }
});

// PUT /api/:table — update rows by filter
app.put('/api/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const { _filters, ...updates } = req.body;
    // Password hashes can only be written through the auth/admin endpoints
    // (which bcrypt them) — never as plaintext via generic update.
    if (table === 'users') delete updates.password_hash;
    const filters = _filters || {};

    const setClauses = [];
    const vals = [];
    let i = 1;
    for (const [col, val] of Object.entries(updates)) {
      setClauses.push(`"${col}" = $${i}`);
      vals.push(typeof val === 'object' ? JSON.stringify(val) : val);
      i++;
    }

    const conds = [];
    for (const [col, val] of Object.entries(filters)) {
      conds.push(`"${col}" = $${i}`);
      vals.push(val);
      i++;
    }

    if (setClauses.length === 0) return res.json({ data: null, error: 'No updates provided' });

    let sql = `UPDATE ${table} SET ${setClauses.join(', ')}`;
    if (conds.length) sql += ` WHERE ${conds.join(' AND ')}`;
    sql += ` RETURNING *`;

    const { rows } = await pool.query(sql, vals);
    res.json({ data: rows, error: null });
  } catch (e) {
    console.error('PUT error:', e.message);
    res.json({ data: null, error: e.message });
  }
});

// DELETE /api/:table — delete rows by filter
app.delete('/api/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const filters = req.query;

    const conds = [];
    const vals = [];
    let i = 1;
    for (const [col, val] of Object.entries(filters)) {
      conds.push(`"${col}" = $${i}`);
      vals.push(val);
      i++;
    }

    let sql = `DELETE FROM ${table}`;
    if (conds.length) sql += ` WHERE ${conds.join(' AND ')}`;

    await pool.query(sql, vals);
    res.json({ data: null, error: null });
  } catch (e) {
    console.error('DELETE error:', e.message);
    res.json({ data: null, error: e.message });
  }
});

const PORT = Number(process.env.PORT || 3001);
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  // Voice bursts (~15s audio) ride the socket — allow them through
  maxHttpBufferSize: 1e7,
});

// ─── Realtime: one room per trip ───────────────────────────
// Rooms: `trip:<tripId>`. Socket user info comes from client handshake
// (local-network app; REST token auth stays the gate for writes via API).

/** Live socket members per room: tripId -> Map(socketId -> {uid, name}) */
const roomMembers = new Map();

function roomOf(tripId) {
  return `trip:${tripId}`;
}

function emitPresence(tripId) {
  const members = roomMembers.get(tripId);
  const online = members
    ? [...members.values()].reduce((acc, m) => {
        if (!acc.some((x) => x.uid === m.uid)) acc.push(m);
        return acc;
      }, [])
    : [];
  io.to(roomOf(tripId)).emit('presence:online', { tripId, online, count: online.length });
}

io.on('connection', (socket) => {
  socket.on('room:join', ({ tripId: tid, uid: u, name: n }) => {
    if (!tid) return;
    socket.join(roomOf(tid));
    if (u) {
      if (!roomMembers.has(tid)) roomMembers.set(tid, new Map());
      roomMembers.get(tid).set(socket.id, { uid: u, name: n || 'Friend', socketId: socket.id });
      emitPresence(tid);
    }
    socket.data.tripId = tid;
    if (u) socket.data.uid = u;
  });

  socket.on('room:leave', ({ tripId: tid }) => {
    if (!tid) return;
    socket.leave(roomOf(tid));
    const members = roomMembers.get(tid);
    if (members && members.delete(socket.id)) emitPresence(tid);
  });

  // Soft bell ping — ephemeral broadcast, NO db row, NO timeline log.
  // Receivers chime + flash; sender stays silent (already chimed locally).
  socket.on('bell:ring', ({ tripId: tid, uid: u, name: n }) => {
    if (!tid) return;
    io.to(roomOf(tid)).emit('bell:ring', { tripId: tid, uid: u, name: n || 'Someone' });
  });

  // Walkie-talkie voice burst — relay to room (sender excluded, they just spoke).
  // Audio rides as data URL; heard-live = vanished. Also ingested for the
  // closed-app path (store + offline-only FCM, deduped with the POST path).
  socket.on('voice:burst', (burst, ack) => {
    try {
      const tid = burst && burst.tripId;
      if (!tid || !burst.voiceUrl) {
        if (ack) ack({ error: 'tripId and voiceUrl required' });
        return;
      }
      // Ingest FIRST so the live relay carries the shared clipId (client dedupe).
      let clipId = null;
      try {
        clipId = ingestVoiceClip({
          clipId: burst.clipId || null,
          tripId: tid,
          voiceUrl: burst.voiceUrl,
          senderUid: burst.senderId || null,
          senderName: burst.senderName || 'Someone',
          apiBase: burst.apiBase || null,
        });
      } catch (e) {
        console.error('voice ingest error:', e.message);
      }
      socket.to(roomOf(tid)).emit('voice:burst', {
        tripId: tid,
        voiceUrl: String(burst.voiceUrl).slice(0, 8 * 1024 * 1024),
        senderId: burst.senderId || null,
        senderName: burst.senderName || 'Someone',
        clipId: clipId,
        at: Date.now(),
      });
      console.log(`voice burst live: trip ${tid} sender ${burst.senderId || '?'} clip ${clipId}`);
      if (ack) ack({ ok: true });
    } catch (e) {
      console.error('voice:burst error:', e.message);
      if (ack) ack({ error: e.message });
    }
  });

  // Typing indicator (ephemeral — never stored)
  socket.on('chat:typing', ({ tripId: tid, uid: u, name: n, typing }) => {
    if (!tid) return;
    socket.to(roomOf(tid)).emit('chat:typing', { tripId: tid, uid: u, name: n, typing: !!typing });
  });

  // Send message: persist, then broadcast to the whole room (incl. sender as ack)
  socket.on('chat:send', async (msg, ack) => {
    try {
      const { id, tripId: tid, type, text, lat, lng, replyTo, mentions, senderId, senderName } = msg || {};
      if (!id || !tid) {
        if (ack) ack({ error: 'id and tripId required' });
        return;
      }
      await pool.query(
        `INSERT INTO chat_messages (id, "tripId", type, text, lat, lng, "replyTo", mentions, "senderId", "senderName")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO NOTHING`,
        [
          id, tid, type || 'text', text || '', lat ?? null, lng ?? null,
          replyTo ? JSON.stringify(replyTo) : null,
          JSON.stringify(mentions || []),
          senderId || null, senderName || '',
        ]
      );
      const { rows } = await pool.query('SELECT * FROM chat_messages WHERE id = $1', [id]);
      const saved = rows[0] || { ...msg };
      io.to(roomOf(tid)).emit('chat:new', saved);
      if (ack) ack({ ok: true, message: saved });
    } catch (e) {
      console.error('chat:send error:', e.message);
      if (ack) ack({ error: e.message });
    }
  });

  // Read receipt: stored, broadcast count so "Seen" ticks live
  socket.on('chat:read', async ({ tripId: tid, messageId, uid: u }) => {
    try {
      if (!tid || !messageId || !u) return;
      await pool.query(
        `INSERT INTO message_reads ("messageId", "tripId", uid, at) VALUES ($1,$2,$3,$4)
         ON CONFLICT ("messageId", uid) DO UPDATE SET at = EXCLUDED.at`,
        [messageId, tid, u, Date.now()]
      );
      const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM message_reads WHERE "messageId" = $1', [messageId]);
      io.to(roomOf(tid)).emit('chat:read', { tripId: tid, messageId, count: rows[0]?.c || 0 });
    } catch (e) {
      console.error('chat:read error:', e.message);
    }
  });

  // Pin / unpin a message (one pinned highlight per room is enforced client-side)
  socket.on('chat:pin', async ({ tripId: tid, messageId, pinned }, ack) => {
    try {
      if (!tid || !messageId) {
        if (ack) ack({ error: 'tripId and messageId required' });
        return;
      }
      if (pinned) {
        await pool.query('UPDATE chat_messages SET pinned = false WHERE "tripId" = $1', [tid]);
      }
      await pool.query('UPDATE chat_messages SET pinned = $1 WHERE id = $2', [!!pinned, messageId]);
      const { rows } = await pool.query('SELECT * FROM chat_messages WHERE id = $1', [messageId]);
      io.to(roomOf(tid)).emit('chat:pin', rows[0] || { id: messageId, tripId: tid, pinned: !!pinned });
      if (ack) ack({ ok: true });
    } catch (e) {
      console.error('chat:pin error:', e.message);
      if (ack) ack({ error: e.message });
    }
  });

  // Delete own message (tombstone — vanishes everywhere)
  socket.on('chat:delete', async ({ tripId: tid, messageId }, ack) => {
    try {
      if (!tid || !messageId) {
        if (ack) ack({ error: 'tripId and messageId required' });
        return;
      }
      await pool.query('UPDATE chat_messages SET "_deleted" = true WHERE id = $1', [messageId]);
      io.to(roomOf(tid)).emit('chat:delete', { tripId: tid, messageId });
      if (ack) ack({ ok: true });
    } catch (e) {
      console.error('chat:delete error:', e.message);
      if (ack) ack({ error: e.message });
    }
  });

  socket.on('disconnect', () => {
    const tid = socket.data.tripId;
    if (tid) {
      const members = roomMembers.get(tid);
      if (members && members.delete(socket.id)) emitPresence(tid);
    } else {
      // Socket joined rooms without room:join tracking — sweep all
      for (const [id, members] of roomMembers) {
        if (members.delete(socket.id)) emitPresence(id);
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`WanderSync API + realtime running on http://localhost:${PORT}`);
});
