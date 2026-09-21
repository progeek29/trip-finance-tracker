const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const http = require('http');
const { Server } = require('socket.io');
const { OAuth2Client } = require('google-auth-library');
try {
  const path = require('path');
  // Local dev reads server/.env next to this file (compose env wins in prod —
  // dotenv never overrides real environment variables).
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch { /* dotenv optional — compose/env already provides vars in prod */ }
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

// Admin gate: role comes from the SESSION (never from body adminId —
// trusting the body let anyone borrow admin rights). Use on every
// /api/admin/* route. This is the master-key foundation.
function requireAdminSession(req, res, next) {
  requireSession(req, res, () => {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ data: null, error: 'Admin access required' });
    }
    next();
  });
}
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── API envelope: every response is { data, error }; failures ALSO carry
// the right HTTP status (client reads the body, monitors read the status).
function fail(res, status, message) {
  return res.status(status).json({ data: null, error: message });
}

// ─── Specific routes FIRST (before generic /:table) ────────

// Root (platform health checks) + API health check
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'wandersync-api' });
});

// Friendly API root response; endpoint clients should use /api/health for DB status.
app.get('/api', (req, res) => {
  res.json({ ok: true, service: 'wandersync-api', health: '/api/health' });
});

// Health check — 503 when the DB is down (monitors read the status).
app.get('/api/health', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT NOW()');
    res.json({ ok: true, time: rows[0].now });
  } catch (e) {
    return res.status(503).json({ ok: false, error: e.message });
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
        // HYBRID retry: notification (proven instant alert) + data (native
        // auto-play + tap-to-trip). Earlier data-silence coincided with dead
        // tokens + quota barrage — never proven against a healthy device.
        // Client dedupes by clipId across socket/FCM/native paths.
        const data = {
          kind: 'voice',
          tripId: c.tripId,
          clipId,
          senderName: c.senderName,
        };
        if (c.apiBase) data.clipUrl = `${c.apiBase}/api/voice-clips/${clipId}`;
        const payload = {
          message: {
            token: t.token,
            data,
            notification: { title: `${c.senderName} • voice in ${tripTitle}`, body: 'Tap to open & listen' },
            android: {
              priority: 'high',
              ttl: '300s',
              notification: { channel_id: 'wandersync_voice', sound: 'default', icon: 'ic_launcher' },
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

// ─── Chat push (WhatsApp-style): offline members get a system notification ──
// Notification-only (proven instant channel). Online members saw it live.
async function fanOutChat({ tripId, senderId, senderName, type, text }) {
  try {
    if (!tripId || type === 'system') return;
    const name = senderName || 'Someone';
    let preview = String(text || '').trim().slice(0, 120);
    let channel = 'wandersync_chat';
    if (type === 'location') preview = '📍 Shared a location';
    else if (type === 'siren') {
      preview = '🚨 Emergency siren — open now';
      channel = 'wandersync_voice';
    }
    if (!preview) preview = 'New message';
    const members = typeof roomMembers !== 'undefined' ? roomMembers.get(tripId) : null;
    const online = new Set(members ? [...members.values()].map((m) => m.uid).filter(Boolean) : []);
    const { rows } = await pool.query('SELECT uid, token FROM push_tokens WHERE "tripId" = $1', [tripId]);
    const targets = rows.filter((r) => r.token && r.uid !== senderId && !online.has(r.uid));
    if (!targets.length) return;
    let tripTitle = 'Trip';
    try {
      const tr = await pool.query('SELECT title FROM trips WHERE id = $1', [tripId]);
      if (tr.rows.length && tr.rows[0].title) tripTitle = String(tr.rows[0].title).slice(0, 60);
    } catch { /* title optional */ }
    const creds = loadFcmCreds();
    if (!creds) return;
    const access = await fcmAccessToken();
    if (!access) return;
    let sent = 0;
    await Promise.all(targets.map(async (t) => {
      try {
        const payload = {
          message: {
            token: t.token,
            notification: { title: `${name} • ${tripTitle}`, body: preview },
            android: {
              priority: 'high',
              ttl: '300s',
              notification: { channel_id: channel, sound: 'default', icon: 'ic_launcher' },
            },
          },
        };
        const r = await fetch(`https://fcm.googleapis.com/v1/projects/${creds.projectId}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (r.ok) sent++;
      } catch { /* per-device fail, skip */ }
    }));
    console.log(`chat FCM: ${sent}/${targets.length} offline (trip ${tripId})`);
  } catch (e) {
    console.error('chat fan-out error:', e.message);
  }
}

// ─── Pass number (cardNo) — permanent per-user `WSXX XXXX XXXX XXXX` ────
// Same deterministic hash as src/utils/cards.ts: every device derives the
// same number, so display never flaps. Stored in users."cardNo" (see
// migrate.cjs); every read tolerates a DB where the column is missing.
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
function cleanCardNo(v, fallbackSeed) {
  const s = String(v || '').trim().toUpperCase();
  if (/^WS\d{2}( \d{4}){3}$/.test(s)) return s;
  return mintCardNo(fallbackSeed);
}

// ─── Username (@handle) — `firstname(≤8)_xxxx`, permanent per user ───────
// Same deterministic hash as src/utils/cards.ts mintUsername: every device
// derives the SAME handle, so display never flaps. Uniqueness enforced by
// idx_users_username_lower (migrate.cjs); collisions re-mint with a `#i`
// seed suffix (format preserved, new suffix).
function usernameSlug(name) {
  return (
    String(name || '').trim().toLowerCase().split(/\s+/)[0]
      ?.replace(/[^a-z0-9]/g, '').slice(0, 8) || 'friend'
  );
}
function mintUsername(name, seed) {
  const slug = usernameSlug(name);
  const s = `${slug}|${String(seed || '').trim().toLowerCase() || 'wandersync-guest'}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h * 31 + s.charCodeAt(i)) >>> 0);
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o/1/l — readable over a call
  let suffix = '';
  let n = h;
  for (let i = 0; i < 4; i++) {
    suffix += alphabet[n % alphabet.length];
    n = Math.floor(n / alphabet.length);
  }
  return `${slug}_${suffix}`;
}
function isValidUsername(v) {
  return !!v && /^[a-z0-9]{1,8}_[a-z0-9]{4}$/.test(String(v).trim().toLowerCase());
}
async function ensureUniqueUsername(name, seed) {
  for (let i = 0; i < 8; i++) {
    const candidate = mintUsername(name, i === 0 ? seed : `${seed}#${i}`);
    try {
      const { rows } = await pool.query(
        'SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [candidate]
      );
      if (rows.length === 0) return candidate;
    } catch (e) {
      if (e && /username/i.test(e.message || '')) return mintUsername(name, seed); // column not migrated yet
      throw e;
    }
  }
  return `${usernameSlug(name)}_${Date.now().toString(36).slice(-4)}`;
}
function cleanGender(v) {
  const s = String(v || '').trim().toLowerCase();
  return s === 'male' || s === 'female' || s === 'other' ? s : 'unspecified';
}
async function insertUser(row) {
  try {
    if (!row.username) row.username = await ensureUniqueUsername(row.name, row.id);
    if (!row.gender) row.gender = 'unspecified';
    await pool.query(
      'INSERT INTO users (id, email, name, phone, role, password_hash, "cardNo", username, gender) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [row.id, row.email, row.name, row.phone, row.role, row.hash, row.cardNo, row.username, row.gender]
    );
  } catch (e) {
    if (e && /cardno|username|gender/i.test(e.message || '')) {
      // Column(s) not migrated yet — legacy insert keeps signup working.
      await pool.query(
        'INSERT INTO users (id, email, name, phone, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)',
        [row.id, row.email, row.name, row.phone, row.role, row.hash]
      );
    } else throw e;
  }
}
async function userByToken(token) {
  try {
    const { rows } = await pool.query(
      'SELECT u.id, u.email, u.name, u.phone, u.role, u."cardNo", u.username, u.gender, u.email_verified FROM auth_sessions s JOIN users u ON u.id = s."userId" WHERE s.token = $1',
      [token]
    );
    return rows[0] || null;
  } catch (e) {
    if (e && /cardno|username|gender|email_verified/i.test(e.message || '')) {
      const { rows } = await pool.query(
        'SELECT u.id, u.email, u.name, u.phone, u.role FROM auth_sessions s JOIN users u ON u.id = s."userId" WHERE s.token = $1',
        [token]
      );
      return rows[0] || null;
    }
    throw e;
  }
}

// Auth: signup — email + phone unique (case/format-proof), validated.
app.post('/api/auth/signup', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || '').trim();
    const phone = normPhone(req.body?.phone);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return fail(res, 400, 'Enter a valid email address');
    }
    if (!password || password.length < 6) {
      return fail(res, 400, 'Password must be at least 6 characters');
    }

    const { rows: existing } = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]
    );
    if (existing.length > 0) {
      return fail(res, 409, 'This email is already registered. Try logging in.');
    }
    if (phone) {
      const { rows: phoneHit } = await pool.query(
        `SELECT id FROM users
         WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g'), 10) = $1`,
        [phone]
      );
      if (phoneHit.length > 0) {
        return fail(res, 409, 'This mobile number is already registered.');
      }
    }

    const id = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const hash = await bcrypt.hash(password, 10);
    const role = email === 'admin@wandersync.com' ? 'admin' : 'user';
    const cardNo = cleanCardNo(req.body?.cardNo, email);
    const gender = cleanGender(req.body?.gender);

    await insertUser({ id, email, name, phone, role, hash, cardNo, gender });
    // New password accounts start UNVERIFIED — no session is minted here.
    // The session is issued only by /otp/verify after the email code passes,
    // so a refresh can never walk into the app unverified.
    try {
      await pool.query('UPDATE users SET email_verified = false WHERE id = $1', [id]);
    } catch (e) {
      if (!(e && /email_verified/i.test(e.message || ''))) throw e;
    }

    const created = await pool.query(
      'SELECT username, gender FROM users WHERE id = $1', [id]
    ).then((r) => r.rows[0]).catch(() => null);
    res.json({ data: { user: { id, email, cardNo, username: created?.username || '', gender: cleanGender(created?.gender || gender) }, needsVerification: true }, error: null });
  } catch (e) {
    // Race-proof backstop: DB unique constraint hit between check and insert.
    if (e && (e.code === '23505' || String(e.message || '').toLowerCase().includes('unique'))) {
      return fail(res, 409, 'This email is already registered. Try logging in.');
    }
    console.error('Signup error:', e.message);
    return fail(res, 500, e.message);
  }
});

// Auth: signin — email normalized (case-proof). Generic failure message on
// purpose: login must NOT reveal whether an email exists (standard practice).
app.post('/api/auth/signin', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) return fail(res, 400, 'Email and password required');

    const { rows } = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (rows.length === 0) return fail(res, 401, 'Invalid email or password');

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash || '');
    if (!valid) return fail(res, 401, 'Invalid email or password');

    // Unverified password accounts cannot enter via login either — they must
    // pass the email code first (client switches them to the verify screen).
    if (user.email_verified === false) {
      return fail(res, 403, 'NEEDS_VERIFICATION: Please verify your email first — check your inbox for the code.');
    }

    const token = await createSession(user.id);
    res.json({ data: { user: { id: user.id, email: user.email, cardNo: user.cardNo || mintCardNo(user.email), username: user.username || mintUsername(user.name, user.id), gender: cleanGender(user.gender) }, token }, error: null });
  } catch (e) {
    console.error('Signin error:', e.message);
    res.json({ data: null, error: e.message });
  }
});

// Auth: Google sign-on — verify ID token server-side, find-or-create user.
// Google users are email-verified by definition (no OTP ever). Username +
// pass number mint through the SAME pipeline (same format, server-unique).
// No password_hash is ever set — password signin stays impossible for them.
app.post('/api/auth/google', async (req, res) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    if (!clientId) return fail(res, 503, 'Google sign-in is not configured on this server');
    const idToken = String(req.body?.idToken || '');
    if (!idToken) return fail(res, 400, 'idToken required');
    const client = new OAuth2Client(clientId);
    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken, audience: clientId });
      payload = ticket.getPayload();
    } catch {
      return fail(res, 401, 'Google verification failed. Try again.');
    }
    const sub = String(payload?.sub || '');
    const email = String(payload?.email || '').trim().toLowerCase();
    if (!sub || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return fail(res, 401, 'Google account has no usable email');
    }
    if (payload?.email_verified === false) {
      return fail(res, 401, 'Google email is not verified');
    }
    const name = String(payload?.name || email.split('@')[0] || 'Friend').trim().slice(0, 80) || 'Friend';

    // 1) Stable link: google_sub wins (email alone is never trusted for linking).
    let user = null;
    try {
      const { rows } = await pool.query('SELECT * FROM users WHERE google_sub = $1', [sub]);
      user = rows[0] || null;
    } catch (e) {
      if (!(e && /google_sub/i.test(e.message || ''))) throw e;
      // Column not migrated yet — fall through to email match.
    }
    // 2) Same verified email, previously password-signed: link the accounts.
    if (!user) {
      const { rows } = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      if (rows[0]) {
        user = rows[0];
        try {
          await pool.query('UPDATE users SET google_sub = $1 WHERE id = $2', [sub, user.id]);
        } catch (e) {
          if (!(e && /google_sub/i.test(e.message || ''))) throw e;
        }
      }
    }
    // 3) Brand new: create through the standard pipeline (username/cardNo minted).
    if (!user) {
      const id = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      const role = email === 'admin@wandersync.com' ? 'admin' : 'user';
      const cardNo = cleanCardNo('', email);
      const username = await ensureUniqueUsername(name, id);
      const row = { id, email, name, phone: '', role, hash: '', cardNo, username, gender: 'unspecified' };
      try {
        await pool.query(
          'INSERT INTO users (id, email, name, phone, role, password_hash, "cardNo", username, gender, google_sub) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [row.id, row.email, row.name, row.phone, row.role, row.hash, row.cardNo, row.username, row.gender, sub]
        );
      } catch (e) {
        if (e && /google_sub/i.test(e.message || '')) {
          await insertUser(row);
        } else throw e;
      }
      user = { ...row, password_hash: '' };
    }
    // Google-verified email by definition: verified in every path (new,
    // freshly linked, or pre-existing). Best-effort for legacy DBs.
    try {
      await pool.query('UPDATE users SET email_verified = true WHERE id = $1', [user.id]);
    } catch (e) {
      if (!(e && /email_verified/i.test(e.message || ''))) throw e;
    }
    const token = await createSession(user.id);
    const fresh = await userByToken(token);
    res.json({
      data: {
        user: {
          id: user.id,
          email: user.email,
          cardNo: (fresh && fresh.cardNo) || user.cardNo || mintCardNo(user.email),
          username: (fresh && fresh.username) || user.username || '',
          gender: cleanGender((fresh && fresh.gender) || user.gender),
        },
        token,
      },
      error: null,
    });
  } catch (e) {
    console.error('Google auth error:', e.message);
    return fail(res, 500, e.message);
  }
});

// Auth: get current user
app.get('/api/auth/user', async (req, res) => {
  try {
    const token = bearerToken(req);
    if (!token) return res.json({ data: { user: null }, error: null });

    const user = await userByToken(token);
    if (!user) return res.json({ data: { user: null }, error: null });
    if (!user.cardNo) user.cardNo = mintCardNo(user.email);
    if (!user.username) {
      // Backfill-on-read (migrate covers existing rows; this is the legacy-DB path).
      // Guarded fill: only when still empty. Race loser re-reads the winner.
      user.username = mintUsername(user.name, user.id);
      try {
        await pool.query(
          'UPDATE users SET username = $1 WHERE id = $2 AND (username IS NULL OR username = $3)',
          [user.username, user.id, '']
        );
      } catch (e) {
        if (e && e.code === '23505') {
          const reread = await pool.query('SELECT username FROM users WHERE id = $1', [user.id]).catch(() => null);
          if (reread?.rows?.[0]?.username) user.username = reread.rows[0].username;
        } else if (!(e && /username/i.test(e.message || ''))) {
          throw e;
        }
      }
    }
    if (!user.gender) user.gender = 'unspecified';
    // Normalised for the client gate: missing column (legacy DB) reads as
    // verified; an explicit false means the OTP step is still pending.
    user.emailVerified = user.email_verified !== false;

    res.json({ data: { user }, error: null });
  } catch (e) {
    res.json({ data: { user: null }, error: e.message });
  }
});

// POST /api/auth/profile — update OWN name/phone/cardNo/gender (session required).
// This is what makes Profile → Save Changes survive the next login: name
// and phone used to live in localStorage only, and the login restore
// overwrote them with stale DB values every time.
app.post('/api/auth/profile', async (req, res) => {
  try {
    const token = bearerToken(req);
    if (!token) return fail(res, 401, 'Login required');
    const me = await userByToken(token);
    if (!me) return fail(res, 401, 'Login required');

    const name = String(req.body?.name || '').trim().slice(0, 80);
    const phoneRaw = req.body?.phone;
    const phone = phoneRaw === undefined || phoneRaw === '' ? '' : normPhone(phoneRaw);
    if (!name) return fail(res, 400, 'Name required');
    if (phoneRaw !== undefined && phoneRaw !== '' && !phone) {
      return fail(res, 400, 'Enter a valid 10-digit mobile number');
    }
    if (phone) {
      const { rows: hit } = await pool.query(
        `SELECT id FROM users WHERE id <> $1 AND RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g'), 10) = $2`,
        [me.id, phone]
      );
      if (hit.length > 0) return fail(res, 409, 'This mobile number is already registered.');
    }
    const incomingCard = String(req.body?.cardNo || '').trim().toUpperCase();
    const wantCard = /^WS\d{2}( \d{4}){3}$/.test(incomingCard) ? incomingCard : null;
    // Gender is freely updatable (validated). Username is permanent like cardNo:
    // filled once from the SERVER mint only — never trusted from the client,
    // because uniqueness is the whole point.
    const gender = cleanGender(req.body?.gender ?? me.gender);
    const params = [name, phone, gender];
    let setExtra = '';
    if (wantCard && !me.cardNo) {
      setExtra += `, "cardNo" = $${params.length + 1}`;
      params.push(wantCard);
    }
    if (!me.username) {
      setExtra += `, username = $${params.length + 1}`;
      params.push(await ensureUniqueUsername(name, me.id));
    }
    params.push(me.id);
    try {
      await pool.query(
        `UPDATE users SET name = $1, phone = $2, gender = $3${setExtra} WHERE id = $${params.length}`,
        params
      );
    } catch (e) {
      if (e && /cardno|username|gender/i.test(e.message || '')) {
        await pool.query('UPDATE users SET name = $1, phone = $2 WHERE id = $3', [name, phone, me.id]);
      } else if (e && e.code === '23505') {
        return fail(res, 409, 'That handle just got taken. Try saving again.');
      } else throw e;
    }
    let user;
    try {
      const { rows } = await pool.query(
        'SELECT id, email, name, phone, role, username, gender FROM users WHERE id = $1',
        [me.id]
      );
      user = rows[0] || { id: me.id, email: me.email, name, phone, role: me.role };
    } catch (e) {
      if (!(e && /username|gender/i.test(e.message || ''))) throw e;
      const { rows } = await pool.query('SELECT id, email, name, phone, role FROM users WHERE id = $1', [me.id]);
      user = rows[0] || { id: me.id, email: me.email, name, phone, role: me.role };
    }
    user.cardNo = me.cardNo || wantCard || mintCardNo(user.email);
    if (!user.username) user.username = mintUsername(user.name, user.id);
    user.gender = cleanGender(user.gender ?? gender);
    res.json({ data: { user }, error: null });
  } catch (e) {
    console.error('Profile update error:', e.message);
    res.json({ data: null, error: e.message });
  }
});

// ─── User directory + password management ────────

function normPhone(p) {
  return String(p || '').replace(/\D/g, '').slice(-10);
}

// (Deleted legacy helper requireAdmin(adminId): trusting a body-supplied id
// for admin rights was the takeover hole. Use requireAdminSession.)

// GET /api/users — user directory WITHOUT password hashes
// (must stay before the generic /:table route)
app.get('/api/users', requireSession, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      const { rows } = await pool.query(
        'SELECT id, email, name, phone, role, username, gender, "createdAt" FROM users WHERE id = $1',
        [req.user.id]
      );
      return res.json({ data: rows, error: null });
    }
    const { rows } = await pool.query(
      'SELECT id, email, name, phone, role, username, gender, "createdAt" FROM users ORDER BY email'
    );
    res.json({ data: rows, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// ─── Email OTP (Brevo): verify + password reset/set ───────────────────────
// One system for three jobs: signup verify, forgot-password, Google-user
// set-password. Codes are bcrypt-hashed, 10-min, 3 attempts. Sends are
// rate-limited (5/hour/email). Responses are ALWAYS generic — never reveal
// whether an address is registered.
async function touchBrevoHeartbeat() {
  try {
    await pool.query(
      `INSERT INTO app_meta (key, value) VALUES ('brevo_last_send', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [String(Date.now())]
    );
  } catch { /* housekeeping must never break auth */ }
}

async function sendBrevoMail(to, subject, text, html) {
  const key = process.env.BREVO_API_KEY || '';
  const sender = process.env.BREVO_SENDER || '';
  if (!key || !sender) throw new Error('mail-not-configured');
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': key },
    body: JSON.stringify({
      sender: { email: sender, name: 'WanderSync' },
      to: [{ email: to }],
      subject,
      textContent: text,
      ...(html ? { htmlContent: html } : {}),
    }),
  });
  if (!res.ok) throw new Error('mail-send-failed: ' + res.status);
  await touchBrevoHeartbeat();
}

// 90-day key heartbeat: any Brevo send resets the clock, but if the app goes
// quiet for 70 days, mail ourselves once so the free key never expires.
const HEARTBEAT_QUIET_MS = 70 * 24 * 3600 * 1000;
async function brevoHeartbeatCheck() {
  try {
    if (!process.env.BREVO_API_KEY) return;
    const { rows } = await pool.query("SELECT value FROM app_meta WHERE key = 'brevo_last_send'");
    const last = Number(rows[0]?.value || 0);
    if (Date.now() - last < HEARTBEAT_QUIET_MS) return;
    const to = process.env.BREVO_HEARTBEAT_TO || process.env.BREVO_SENDER || '';
    if (!to) return;
    await sendBrevoMail(
      to,
      'WanderSync key heartbeat 💓',
      'Ignore this mail — it keeps our free email key alive.\nSent automatically after ~70 days without any app mail.'
    );
    console.log('Heartbeat mail sent to', to);
  } catch (e) {
    console.error('brevo heartbeat:', e.message);
  }
}
setInterval(brevoHeartbeatCheck, 24 * 3600 * 1000).unref();
setTimeout(() => void brevoHeartbeatCheck(), 60 * 1000).unref();

const OTP_PURPOSES = new Set(['verify', 'reset']);
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 3;
const OTP_MAX_PER_HOUR = 5;

function otpMailSubject(purpose) {
  return purpose === 'verify' ? 'Verify your WanderSync email' : 'Reset your WanderSync password';
}

function otpMailText(code, purpose) {
  const what = purpose === 'verify' ? 'verify your WanderSync email' : 'reset your WanderSync password';
  return `Your WanderSync code: ${code}\n\nUse it within 10 minutes to ${what}.\nNever share this code with anyone.`;
}

// Premium branded HTML (email-safe: tables + inline styles only — Gmail
// strips JS/CSS files, so no copy button is possible; the code block is
// big + letter-spaced for one-tap select instead).
function otpMailHtml(code, purpose) {
  const title = purpose === 'verify' ? 'Verify your email' : 'Reset your password';
  const line =
    purpose === 'verify'
      ? 'Enter this code in WanderSync to verify your email address.'
      : 'Enter this code in WanderSync to set a new password.';
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 8px 30px rgba(79,70,229,0.12);">
<tr><td align="center" style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:34px 24px 26px;">
<div style="color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.5px;">WanderSync</div>
<div style="color:rgba(255,255,255,0.85);font-size:12px;margin-top:6px;letter-spacing:2px;">TRIPS · SPLITS · SQUAD CHAT</div>
</td></tr>
<tr><td align="center" style="padding:28px 40px 8px;">
<div style="color:#0f172a;font-size:15px;font-weight:800;">${title}</div>
<p style="color:#64748b;font-size:13px;margin:8px 0 0;">${line}</p>
</td></tr>
<tr><td align="center" style="padding:16px 40px 8px;">
<div style="display:inline-block;background:#eef2ff;border:1px dashed #c7d2fe;border-radius:16px;padding:18px 40px;color:#4338ca;font-size:36px;font-weight:800;letter-spacing:12px;">${code}</div>
<p style="color:#94a3b8;font-size:11px;margin:14px 0 0;">Valid 10 minutes</p>
</td></tr>
<tr><td align="center" style="padding:8px 32px 28px;">
<p style="color:#94a3b8;font-size:11px;margin:0;">Didn't ask for this? Ignore — your account is safe.</p>
<p style="color:#cbd5e1;font-size:11px;margin:8px 0 0;">Never share this code with anyone.</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

// POST /api/otp/request {email, purpose} — always generic {ok:true}.
app.post('/api/otp/request', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const purpose = String(req.body?.purpose || '');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !OTP_PURPOSES.has(purpose)) {
      return res.json({ data: { ok: true }, error: null });
    }
    const hourAgo = Date.now() - 3600 * 1000;
    try {
      const { rows: recent } = await pool.query(
        "SELECT COUNT(*)::int AS n FROM email_otps WHERE email = $1 AND \"createdAt\" > $2",
        [email, hourAgo]
      );
      if ((recent[0]?.n || 0) >= OTP_MAX_PER_HOUR) return res.json({ data: { ok: true }, error: null });
    } catch { /* table missing — fall through to generic ok */ }
    // No account → no mail (quota-safe), same generic answer (no enumeration).
    const { rows: users } = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (users.length === 0) return res.json({ data: { ok: true }, error: null });
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const hash = await bcrypt.hash(code, 10);
    const now = Date.now();
    await pool.query("DELETE FROM email_otps WHERE email = $1 AND purpose = $2 AND consumed = false", [email, purpose]);
    await pool.query(
      'INSERT INTO email_otps (id, email, purpose, code_hash, expires_at, attempts, consumed, "createdAt") VALUES ($1,$2,$3,$4,$5,0,false,$6)',
      [`otp_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`, email, purpose, hash, now + OTP_TTL_MS, now]
    );
    try {
      await sendBrevoMail(email, otpMailSubject(purpose), otpMailText(code, purpose), otpMailHtml(code, purpose));
    } catch (e) {
      console.error('OTP mail failed:', e.message);
      return res.json({ data: { ok: true }, error: null });
    }
    return res.json({ data: { ok: true }, error: null });
  } catch (e) {
    console.error('OTP request error:', e.message);
    return res.json({ data: { ok: true }, error: null });
  }
});

// POST /api/otp/verify {email, purpose, code} — verify → {verified:true};
// reset → {resetToken} (15-min, single-use) for the password write.
app.post('/api/otp/verify', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const purpose = String(req.body?.purpose || '');
    const code = String(req.body?.code || '').trim();
    if (!email || !OTP_PURPOSES.has(purpose) || !/^\d{6}$/.test(code)) {
      return fail(res, 400, 'Invalid code. Check the 6-digit code and retry.');
    }
    // Resend-race safe: a rapid double-tap can leave two live rows behind
    // (both mails sent). EVERY active row is tried newest-first; the one
    // that matches is consumed and all older siblings die with it — so no
    // "two valid codes" confusion is possible.
    const { rows } = await pool.query(
      'SELECT * FROM email_otps WHERE email = $1 AND purpose = $2 AND consumed = false ORDER BY "createdAt" DESC LIMIT 5',
      [email, purpose]
    );
    const live = (rows || []).filter((r) => r.expires_at >= Date.now() && r.attempts < OTP_MAX_ATTEMPTS);
    if (live.length === 0) {
      return fail(res, 401, 'Code expired. Request a fresh one.');
    }
    let row = null;
    for (const cand of live) {
      if (await bcrypt.compare(code, cand.code_hash)) {
        row = cand;
        break;
      }
    }
    if (!row) {
      await pool.query(
        'UPDATE email_otps SET attempts = attempts + 1 WHERE id = ANY($1)',
        [live.map((r) => r.id)]
      );
      return fail(res, 401, 'Wrong code. Check and retry.');
    }
    await pool.query('UPDATE email_otps SET consumed = true WHERE email = $1 AND purpose = $2 AND consumed = false', [
      email,
      purpose,
    ]);
    if (purpose === 'verify') {
      try {
        await pool.query('UPDATE users SET email_verified = true WHERE LOWER(email) = LOWER($1)', [email]);
      } catch (e) {
        if (!(e && /email_verified/i.test(e.message || ''))) throw e;
      }
      // The code proved email ownership — issue the session HERE (signup
      // minted none), so the user walks into the app verified.
      const { rows: uread } = await pool.query('SELECT id, email FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      const verifiedUser = uread[0];
      if (!verifiedUser) return fail(res, 404, 'Account not found. Please sign up again.');
      const token = await createSession(verifiedUser.id);
      return res.json({ data: { verified: true, token, user: { id: verifiedUser.id, email: verifiedUser.email } }, error: null });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    await pool.query(
      'INSERT INTO password_resets (token, email, expires_at, consumed, "createdAt") VALUES ($1,$2,$3,false,$4)',
      [token, email, now + 15 * 60 * 1000, now]
    );
    return res.json({ data: { resetToken: token }, error: null });
  } catch (e) {
    console.error('OTP verify error:', e.message);
    return fail(res, 500, e.message);
  }
});

// POST /api/auth/reset-password {token, newPassword} — OTP-verified write.
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const token = String(req.body?.token || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!token || !newPassword || newPassword.length < 6) {
      return fail(res, 400, 'Valid token and 6+ character password required');
    }
    const { rows } = await pool.query(
      'SELECT * FROM password_resets WHERE token = $1 AND consumed = false',
      [token]
    );
    const row = rows[0];
    if (!row || row.expires_at < Date.now()) {
      return fail(res, 401, 'Reset session expired. Start over.');
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE LOWER(email) = LOWER($2)', [hash, row.email]);
    try {
      await pool.query('UPDATE users SET email_verified = true WHERE LOWER(email) = LOWER($1)', [row.email]);
    } catch (e) {
      if (!(e && /email_verified/i.test(e.message || ''))) throw e;
    }
    await pool.query('UPDATE password_resets SET consumed = true WHERE token = $1', [token]);
    res.json({ data: { ok: true }, error: null });
  } catch (e) {
    console.error('Reset password error:', e.message);
    return fail(res, 500, e.message);
  }
});

// POST /api/auth/forgot-password — DISABLED (was: email-only reset with zero
// verification = anyone could take over anyone's account). Recovery path:
// admin resets via /api/admin/reset-password (session-verified). OTP-based
// self-service returns as its own module later — do NOT re-enable this
// endpoint without a verification step.
app.post('/api/auth/forgot-password', async (req, res) => {
  return fail(
    res,
    503,
    'Password reset is handled by support right now. Ask the admin to reset it for you.'
  );
});

// POST /api/auth/logout-all — kill EVERY session for this user, all devices/tabs.
// Enterprise rule: logout must revoke server-side, not just wipe local storage.
app.post('/api/auth/logout-all', requireSession, async (req, res) => {
  try {
    await pool.query('DELETE FROM auth_sessions WHERE "userId" = $1', [req.user.id]);
    res.json({ data: { ok: true }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// POST /api/admin/create-user — admin creates a login-ready user (hashed server-side).
// Session-gated: the admin is req.user, never a body adminId.
app.post('/api/admin/create-user', requireAdminSession, async (req, res) => {
  try {
    const { email, password, name, phone, role } = req.body;
    if (!email || !password) return res.json({ data: null, error: 'Email and password required' });
    if (password.length < 6) return res.json({ data: null, error: 'Password must be at least 6 characters' });

    const safeRole = ['user', 'owner', 'admin'].includes(role) ? role : 'user';
    const { rows: existing } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.length > 0) return res.json({ data: null, error: 'User already exists' });

    const id = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const hash = await bcrypt.hash(password, 10);
    const cardNo = cleanCardNo(req.body?.cardNo, email);
    await insertUser({ id, email, name: name || '', phone: phone || '', role: safeRole, hash, cardNo });
    res.json({ data: [{ id, email, name: name || '', phone: phone || '', role: safeRole, cardNo }], error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// POST /api/admin/reset-password — admin sets a new password for any user
// (passwords are bcrypt hashes: nobody, not even admin, can SEE a password).
// Session-gated recovery path (forgot-password is disabled until OTP exists).
app.post('/api/admin/reset-password', requireAdminSession, async (req, res) => {
  try {
    const { userId, newPassword } = req.body;
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

// POST /api/admin/impersonate — master key: login AS any user (debug/support).
// Session-gated admin-only. Audit-logged to server console (who → whom, when).
// Frontend swaps its token, reloads as that user; back-to-admin restores.
app.post('/api/admin/impersonate', requireAdminSession, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.json({ data: null, error: 'User required' });
    if (userId === req.user.id) return res.json({ data: null, error: 'You are already yourself' });
    const { rows } = await pool.query('SELECT id, email, name FROM users WHERE id = $1', [userId]);
    if (rows.length === 0) return res.json({ data: null, error: 'User not found' });
    const token = await createSession(userId);
    console.log(`ADMIN-IMPERSONATE admin=${req.user.id} (${req.user.email}) -> user=${userId} (${rows[0].email})`);
    res.json({ data: { token, user: rows[0] }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// POST /api/admin/delete-user — admin deletes a user + their owned trips (refuses self-delete).
// Session-gated: the admin is req.user, never a body adminId.
app.post('/api/admin/delete-user', requireAdminSession, async (req, res) => {
  try {
    const { userId } = req.body;
    const admin = req.user;
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

// ─── Chat requests + Co-Travelers (friends) ──────────────────────────
// Rule: no accept = zero messages. Search never leaks email/phone.
// All routes session-gated; users can only act as themselves (admin bypass
// intentionally NOT added here — friendship is consensual, even for admins).

const REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Any live edge (pending or accepted) between two users, either direction.
async function requestEdge(a, b) {
  const { rows } = await pool.query(
    `SELECT id, "fromUid", "toUid", status FROM chat_requests
     WHERE status IN ('pending','accepted')
     AND (("fromUid" = $1 AND "toUid" = $2) OR ("fromUid" = $2 AND "toUid" = $1))
     LIMIT 1`,
    [a, b]
  );
  return rows[0] || null;
}

// GET /api/users/search?q= — people search by @handle or name.
// Leading @ stripped (users naturally type "@zon_ft9c").
// Single-char works ("Z" finds Zon + all matches). PUBLIC bits only
// (never email/phone). Max 15 rows.
app.get('/api/users/search', requireSession, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().replace(/^@+/, '').slice(0, 24);
    if (q.length < 1) return res.json({ data: [], error: null });
    const { rows } = await pool.query(
      `SELECT id, name, username, gender FROM users
       WHERE id <> $1 AND (username ILIKE $2 || '%' OR name ILIKE '%' || $2 || '%')
       ORDER BY username LIMIT 15`,
      [req.user.id, q]
    );
    res.json({ data: rows, error: null });
  } catch (e) {
    res.json({ data: [], error: e.message });
  }
});

// POST /api/requests {toUsername} — send a chat request.
app.post('/api/requests', requireSession, async (req, res) => {
  try {
    const to = String(req.body?.toUsername || '').trim().toLowerCase();
    if (!to) return fail(res, 400, 'Username required');
    const { rows: found } = await pool.query(
      'SELECT id, name, username, gender FROM users WHERE LOWER(username) = LOWER($1)',
      [to]
    );
    const target = found[0];
    if (!target) return fail(res, 404, 'No user with that handle');
    if (target.id === req.user.id) return fail(res, 400, 'That is you');
    const edge = await requestEdge(req.user.id, target.id);
    if (edge) {
      return fail(res, 409, edge.status === 'accepted' ? 'Already connected' : 'Request already pending');
    }
    const id = 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const now = Date.now();
    await pool.query(
      'INSERT INTO chat_requests (id, "fromUid", "toUid", status, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$5)',
      [id, req.user.id, target.id, 'pending', now]
    );
    res.json({ data: { id, to: target }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// GET /api/requests?box=received|sent — inbox with other-side public profile.
app.get('/api/requests', requireSession, async (req, res) => {
  try {
    const box = req.query.box === 'sent' ? 'sent' : 'received';
    // Fixed literals only (never user input) — safe to interpolate quoted.
    const otherCol = box === 'sent' ? 'toUid' : 'fromUid';
    const mineCol = box === 'sent' ? 'fromUid' : 'toUid';
    const { rows } = await pool.query(
      `SELECT r.id, r.status, r."createdAt", u.id AS "uid", u.name, u.username, u.gender
       FROM chat_requests r JOIN users u ON u.id = r."${otherCol}"
       WHERE r."${mineCol}" = $1 AND r.status = 'pending'
       ORDER BY r."createdAt" DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ data: rows, error: null });
  } catch (e) {
    res.json({ data: [], error: e.message });
  }
});

// POST /api/requests/:id/accept — receiver only. Opens the 1:1 room.
app.post('/api/requests/:id/accept', requireSession, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!REQUEST_ID.test(id)) return fail(res, 400, 'Bad id');
    const { rows } = await pool.query('SELECT * FROM chat_requests WHERE id = $1', [id]);
    const r = rows[0];
    if (!r || r.toUid !== req.user.id || r.status !== 'pending') {
      return fail(res, 404, 'Request not found');
    }
    await pool.query(
      'UPDATE chat_requests SET status = $1, "updatedAt" = $2 WHERE id = $3',
      ['accepted', Date.now(), id]
    );
    res.json({ data: { id, status: 'accepted' }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// POST /api/requests/:id/decline — receiver only. SILENT (sender sees nothing).
app.post('/api/requests/:id/decline', requireSession, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!REQUEST_ID.test(id)) return fail(res, 400, 'Bad id');
    const { rows } = await pool.query('SELECT * FROM chat_requests WHERE id = $1', [id]);
    const r = rows[0];
    if (!r || r.toUid !== req.user.id || r.status !== 'pending') {
      return fail(res, 404, 'Request not found');
    }
    await pool.query(
      'UPDATE chat_requests SET status = $1, "updatedAt" = $2 WHERE id = $3',
      ['declined', Date.now(), id]
    );
    res.json({ data: { id, status: 'declined' }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// POST /api/requests/:id/cancel — sender undo (pending only). Deletes the row.
app.post('/api/requests/:id/cancel', requireSession, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!REQUEST_ID.test(id)) return fail(res, 400, 'Bad id');
    const { rows } = await pool.query('SELECT * FROM chat_requests WHERE id = $1', [id]);
    const r = rows[0];
    if (!r || r.fromUid !== req.user.id || r.status !== 'pending') {
      return fail(res, 404, 'Request not found');
    }
    await pool.query('DELETE FROM chat_requests WHERE id = $1', [id]);
    res.json({ data: { id, status: 'cancelled' }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// POST /api/friends/remove {uid} — unfriend: delete the accepted edge both
// directions + pull them out of shared groups. History rows stay (audit),
// but the room vanishes from both lists (friends query is accepted-only).
app.post('/api/friends/remove', requireSession, async (req, res) => {
  try {
    const uid = String(req.body?.uid || '');
    if (!uid || uid === req.user.id) return fail(res, 400, 'Bad user');
    await pool.query(
      `DELETE FROM chat_requests WHERE status = 'accepted' AND
       (("fromUid" = $1 AND "toUid" = $2) OR ("fromUid" = $2 AND "toUid" = $1))`,
      [req.user.id, uid]
    );
    // Strip from shared groups (groups with <2 others left stay — harmless).
    const { rows } = await pool.query(
      `SELECT id, "memberUids" FROM chat_groups WHERE "memberUids" ? $1`,
      [req.user.id]
    );
    for (const g of rows) {
      let members = [];
      try {
        members = Array.isArray(g.memberUids) ? g.memberUids : JSON.parse(g.memberUids || '[]');
      } catch { continue; }
      if (!members.includes(uid)) continue;
      const next = members.filter((m) => m !== uid);
      await pool.query('UPDATE chat_groups SET "memberUids" = $1 WHERE id = $2', [
        JSON.stringify(next),
        g.id,
      ]);
    }
    res.json({ data: { ok: true }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// GET /api/friends — accepted Co-Travelers (either direction), public bits.
app.get('/api/friends', requireSession, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id AS "uid", u.name, u.username, u.gender,
              (SELECT MAX("updatedAt") FROM chat_requests r
               WHERE r.status = 'accepted'
               AND ((r."fromUid" = $1 AND r."toUid" = u.id) OR (r."fromUid" = u.id AND r."toUid" = $1))) AS "since"
       FROM users u
       WHERE u.id <> $1 AND EXISTS (
         SELECT 1 FROM chat_requests r WHERE r.status = 'accepted'
         AND ((r."fromUid" = $1 AND r."toUid" = u.id) OR (r."fromUid" = u.id AND r."toUid" = $1))
       )
       ORDER BY u.name LIMIT 200`,
      [req.user.id]
    );
    res.json({ data: rows, error: null });
  } catch (e) {
    res.json({ data: [], error: e.message });
  }
});

// POST /api/groups {memberUids: string[], name?: string} — create a friend group.
// Every picked member must already be an accepted Co-Traveler of the creator
// (groups never smuggle strangers in). Returns the shared room id.
app.post('/api/groups', requireSession, async (req, res) => {
  try {
    const picks = Array.isArray(req.body?.memberUids) ? req.body.memberUids : [];
    const clean = [...new Set(picks.map((u) => String(u || '')))].filter((u) => u && u !== req.user.id);
    if (clean.length < 2) return fail(res, 400, 'Pick at least 2 Co-Travelers');
    if (clean.length > 20) return fail(res, 400, 'Max 20 members');
    const name = String(req.body?.name || '').trim().slice(0, 60);
    const { rows: fr } = await pool.query(
      `SELECT CASE WHEN "fromUid" = $1 THEN "toUid" ELSE "fromUid" END AS "uid"
       FROM chat_requests WHERE status = 'accepted' AND ("fromUid" = $1 OR "toUid" = $1)`,
      [req.user.id]
    );
    const mine = new Set(fr.map((r) => r.uid));
    const strangers = clean.filter((u) => !mine.has(u));
    if (strangers.length > 0) return fail(res, 403, 'Only Co-Travelers can join a group');
    const id = 'grp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const members = [...clean, req.user.id].sort();
    try {
      await pool.query(
        'INSERT INTO chat_groups (id, "memberUids", "createdBy", "createdAt", name) VALUES ($1, $2, $3, $4, $5)',
        [id, JSON.stringify(members), req.user.id, Date.now(), name]
      );
    } catch (e) {
      if (e && /name/i.test(e.message || '')) {
        // Column not migrated yet — nameless group keeps working.
        await pool.query(
          'INSERT INTO chat_groups (id, "memberUids", "createdBy", "createdAt") VALUES ($1, $2, $3, $4)',
          [id, JSON.stringify(members), req.user.id, Date.now()]
        );
      } else throw e;
    }
    res.json({ data: { id, memberUids: members, name }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// PUT /api/groups/:id {name} — rename. ANY member can rename (WhatsApp rule).
app.put('/api/groups/:id', requireSession, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!/^grp_[A-Za-z0-9_-]{1,64}$/.test(id)) return fail(res, 400, 'Bad id');
    const name = String(req.body?.name || '').trim().slice(0, 60);
    if (!name) return fail(res, 400, 'Name required');
    const { rows } = await pool.query('SELECT "memberUids" FROM chat_groups WHERE id = $1', [id]);
    const g = rows[0];
    if (!g) return fail(res, 404, 'Group not found');
    const members = Array.isArray(g.memberUids) ? g.memberUids : JSON.parse(g.memberUids || '[]');
    if (!members.includes(req.user.id)) return fail(res, 403, 'Members only');
    try {
      await pool.query('UPDATE chat_groups SET name = $1 WHERE id = $2', [name, id]);
    } catch (e) {
      if (!(e && /name/i.test(e.message || ''))) throw e;
      return fail(res, 503, 'Update the app backend first (migrate pending)');
    }
    res.json({ data: { id, name }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// GET /api/groups/mine — groups I belong to (for the Chats list + newcomer watch).
// creatorName rides along so "X added you to group Y" never reads "Someone".
app.get('/api/groups/mine', requireSession, async (req, res) => {
  try {
    let rows;
    try {
      ({ rows } = await pool.query(
        `SELECT g.id, g."memberUids", g."createdBy", g."createdAt", g.name, u.name AS "creatorName"
         FROM chat_groups g LEFT JOIN users u ON u.id = g."createdBy"
         WHERE g."memberUids" ? $1 ORDER BY g."createdAt" DESC LIMIT 50`,
        [req.user.id]
      ));
    } catch (e) {
      if (!(e && /name/i.test(e.message || ''))) throw e;
      ({ rows } = await pool.query(
        `SELECT id, "memberUids", "createdBy", "createdAt" FROM chat_groups
         WHERE "memberUids" ? $1 ORDER BY "createdAt" DESC LIMIT 50`,
        [req.user.id]
      ));
    }
    res.json({ data: rows, error: null });
  } catch (e) {
    res.json({ data: [], error: e.message });
  }
});

// Room membership gate (DM/group rooms only — trip rooms untouched).
// grp_* → sender must be in memberUids. dm_* → an accepted friendship edge
// must exist between sender and a peer whose derived room id matches.
// System lines (join/created/added/left audit trail) are exempt — they are
// posted by the acting client at action time, never user chat content.
async function canSendInRoom(uid, tid, type) {
  if (!tid || !uid) return false;
  if (type === 'system') return true;
  if (tid.startsWith('grp_')) {
    try {
      const { rows } = await pool.query('SELECT "memberUids" FROM chat_groups WHERE id = $1', [tid]);
      if (!rows[0]) return false;
      const m = Array.isArray(rows[0].memberUids) ? rows[0].memberUids : JSON.parse(rows[0].memberUids || '[]');
      return m.includes(uid);
    } catch {
      return false;
    }
  }
  if (tid.startsWith('dm_')) {
    try {
      const { rows } = await pool.query(
        `SELECT CASE WHEN "fromUid" = $1 THEN "toUid" ELSE "fromUid" END AS "uid"
         FROM chat_requests WHERE status = 'accepted' AND ("fromUid" = $1 OR "toUid" = $1)`,
        [uid]
      );
      return rows.map((r) => r.uid).some((p) => `dm_${[uid, p].sort().join('_')}` === tid);
    } catch {
      return false;
    }
  }
  return true;
}

// DELETE /api/groups/:id — creator ONLY deletes the whole group: history
// rows first, then the group row. Members just see it vanish on next poll.
app.delete('/api/groups/:id', requireSession, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!/^grp_[A-Za-z0-9_-]{1,64}$/.test(id)) return fail(res, 400, 'Bad id');
    const { rows } = await pool.query('SELECT "createdBy" FROM chat_groups WHERE id = $1', [id]);
    if (!rows[0]) return fail(res, 404, 'Group not found');
    if (rows[0].createdBy !== req.user.id) return fail(res, 403, 'Only the group creator can delete it');
    await pool.query('DELETE FROM chat_messages WHERE "tripId" = $1', [id]);
    await pool.query('DELETE FROM chat_groups WHERE id = $1', [id]);
    res.json({ data: { id, deleted: true }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// POST /api/groups/:id/members {add?: string[], remove?: string[]} — any member
// can add Co-Travelers or remove members (self-remove = leave). A group with
// no members left is deleted. Timeline lines ("X added Y") are posted by the
// CLIENT as system chat messages (same pattern as trip join lines).
app.post('/api/groups/:id/members', requireSession, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!/^grp_[A-Za-z0-9_-]{1,64}$/.test(id)) return fail(res, 400, 'Bad id');
    const { rows } = await pool.query('SELECT "memberUids", "createdBy" FROM chat_groups WHERE id = $1', [id]);
    const g = rows[0];
    if (!g) return fail(res, 404, 'Group not found');
    let members = Array.isArray(g.memberUids) ? g.memberUids : JSON.parse(g.memberUids || '[]');
    let creator = g.createdBy;
    if (!members.includes(req.user.id)) return fail(res, 403, 'Members only');
    const add = [...new Set((Array.isArray(req.body?.add) ? req.body.add : []).map((u) => String(u || '')))]
      .filter((u) => u && u !== req.user.id && !members.includes(u));
    const remove = [...new Set((Array.isArray(req.body?.remove) ? req.body.remove : []).map((u) => String(u || '')))]
      .filter((u) => u && members.includes(u));
    if (add.length > 0) {
      const { rows: fr } = await pool.query(
        `SELECT CASE WHEN "fromUid" = $1 THEN "toUid" ELSE "fromUid" END AS "uid"
         FROM chat_requests WHERE status = 'accepted' AND ("fromUid" = $1 OR "toUid" = $1)`,
        [req.user.id]
      );
      const mine = new Set(fr.map((r) => r.uid));
      const strangers = add.filter((u) => !mine.has(u));
      if (strangers.length > 0) return fail(res, 403, 'Only Co-Travelers can join a group');
      members = [...members, ...add];
      if (members.length > 21) return fail(res, 400, 'Max 20 members + you');
    }
    if (remove.length > 0) members = members.filter((u) => !remove.includes(u));
    if (members.length === 0) {
      await pool.query('DELETE FROM chat_groups WHERE id = $1', [id]);
      return res.json({ data: { id, memberUids: [], deleted: true }, error: null });
    }
    // Admin (creator) left or was removed → role passes to the next member.
    // Group itself (name, history, everyone else) stays exactly as it is.
    if (!members.includes(creator)) {
      creator = members[0];
      await pool.query('UPDATE chat_groups SET "memberUids" = $1, "createdBy" = $2 WHERE id = $3', [JSON.stringify(members), creator, id]);
    } else {
      await pool.query('UPDATE chat_groups SET "memberUids" = $1 WHERE id = $2', [JSON.stringify(members), id]);
    }
    res.json({ data: { id, memberUids: members, createdBy: creator }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// ─── Blogs: long-form travel stories ────────────────────────────────────
// Statuses: draft → pending → published / rejected. Admin approves +
// features (login cards). Users CRUD own; admin everything.
const BLOG_TAGS = new Set(['itinerary', 'journal', 'tip', 'food', 'stay']);
const BLOG_ID = /^[A-Za-z0-9_-]{1,64}$/;

function blogSlug(title, id) {
  const slug =
    String(title || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) ||
    'story';
  return `${slug}-${String(id).slice(-6)}`;
}

function blogExcerpt(body) {
  return String(body || '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

// Blog cover_url looks like {origin}/api/moments/<photoId>/bytes — recover
// the backing photo id (null for empty/external covers).
function photoIdFromCoverUrl(url) {
  const m = String(url || '').match(/\/api\/moments\/([^/]+)\/bytes/);
  return m ? m[1] : null;
}

async function blogCounts(id) {
  const [l, c] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS n FROM blog_likes WHERE "blogId" = $1', [id]).catch(() => ({ rows: [{ n: 0 }] })),
    pool.query('SELECT COUNT(*)::int AS n FROM blog_comments WHERE "blogId" = $1', [id]).catch(() => ({ rows: [{ n: 0 }] })),
  ]);
  return { likes: l.rows[0]?.n || 0, comments: c.rows[0]?.n || 0 };
}

// GET /api/blogs?status=&tag=&featured=&limit= — published = public.
// Other statuses need admin. likedByMe rides along when a session exists.
app.get('/api/blogs', async (req, res) => {
  try {
    const status = String(req.query.status || 'published');
    const tag = String(req.query.tag || '');
    const featured = String(req.query.featured || '') === 'true';
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    let me = null;
    if (status !== 'published') {
      const tok = bearerToken(req);
      if (!tok) return fail(res, 401, 'Login required');
      const u = await userByToken(tok).catch(() => null);
      if (!u || u.role !== 'admin') return fail(res, 403, 'Admin only');
    } else {
      try {
        const tok = bearerToken(req);
        if (tok) {
          const u = await userByToken(tok).catch(() => null);
          if (u) me = u.id;
        }
      } catch { /* public read proceeds */ }
    }
    const conds = ['b.status = $1'];
    const vals = [status];
    if (tag && BLOG_TAGS.has(tag)) {
      conds.push(`b.tag = $${vals.length + 1}`);
      vals.push(tag);
    }
    if (featured) conds.push('b.featured = true');
    vals.push(limit);
    const orderBy = featured
      ? 'b.sort_order ASC, b."updatedAt" DESC'
      : 'b."updatedAt" DESC';
    const { rows } = await pool.query(
      `SELECT b.id, b.author_uid, b.title, b.slug, b.cover_url, b.tag,
        b.status, b.featured, b.sort_order, b.views, b."createdAt", b."updatedAt",
        u.name AS author_name, u.username AS author_username,
        (SELECT COUNT(*)::int FROM blog_likes l WHERE l."blogId" = b.id) AS "likeCount"
       FROM blog_posts b LEFT JOIN users u ON u.id = b.author_uid
       WHERE ${conds.join(' AND ')}
       ORDER BY ${orderBy} LIMIT $${vals.length}`,
      vals
    );
    let liked = new Set();
    if (me) {
      try {
        const { rows: lr } = await pool.query('SELECT "blogId" FROM blog_likes WHERE uid = $1', [me]);
        liked = new Set(lr.map((r) => r.blogId));
      } catch { /* table missing — all false */ }
    }
    res.json({
      data: rows.map((r) => ({
        id: r.id,
        authorUid: r.author_uid,
        authorName: r.author_name || 'Someone',
        authorUsername: r.author_username || '',
        title: r.title || '',
        slug: r.slug || '',
        excerpt: blogExcerpt(r.body),
        coverUrl: r.cover_url || '',
        tag: r.tag || 'journal',
        status: r.status,
        featured: !!r.featured,
        sortOrder: Number(r.sort_order || 0),
        views: Number(r.views || 0),
        likesCount: Number(r.likeCount || 0),
        likedByMe: liked.has(r.id),
        createdAt: Number(r.createdAt || 0),
        updatedAt: Number(r.updatedAt || 0),
      })),
      error: null,
    });
  } catch (e) {
    console.error('GET /api/blogs error:', e.message);
    res.json({ data: [], error: e.message });
  }
});

// GET /api/blogs/mine — own posts in every status (composer + profile).
app.get('/api/blogs/mine', requireSession, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.id, b.author_uid, b.title, b.slug, b.cover_url, b.tag,
        b.status, b.featured, b.views, b."createdAt", b."updatedAt",
        u.name AS author_name, u.username AS author_username,
        (SELECT COUNT(*)::int FROM blog_likes l WHERE l."blogId" = b.id) AS "likeCount"
       FROM blog_posts b LEFT JOIN users u ON u.id = b.author_uid
       WHERE b.author_uid = $1
       ORDER BY b."updatedAt" DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({
      data: rows.map((r) => ({
        id: r.id,
        authorUid: r.author_uid,
        authorName: r.author_name || 'Someone',
        authorUsername: r.author_username || '',
        title: r.title || '',
        slug: r.slug || '',
        coverUrl: r.cover_url || '',
        tag: r.tag || 'journal',
        status: r.status,
        featured: !!r.featured,
        views: Number(r.views || 0),
        likesCount: Number(r.likeCount || 0),
        createdAt: Number(r.createdAt || 0),
        updatedAt: Number(r.updatedAt || 0),
      })),
      error: null,
    });
  } catch (e) {
    res.json({ data: [], error: e.message });
  }
});

// GET /api/blogs/:id — full body + embedded moments. Public if published
// (non-registered view-only); otherwise author/admin only. Views +1.
app.get('/api/blogs/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!BLOG_ID.test(id)) return fail(res, 400, 'Bad id');
    const { rows } = await pool.query(
      `SELECT b.*, u.name AS author_name, u.username AS author_username,
        (SELECT COUNT(*)::int FROM blog_likes l WHERE l."blogId" = b.id) AS "likeCount",
        (SELECT COUNT(*)::int FROM blog_comments c WHERE c."blogId" = b.id) AS "commentCount"
       FROM blog_posts b LEFT JOIN users u ON u.id = b.author_uid
       WHERE b.id = $1 OR b.slug = $1`,
      [id]
    );
    const b = rows[0];
    if (!b) return fail(res, 404, 'Not found');
    let me = null;
    try {
      const tok = bearerToken(req);
      if (tok) {
        const u = await userByToken(tok).catch(() => null);
        if (u) me = u.id;
      }
    } catch { /* public read proceeds */ }
    const canSee =
      b.status === 'published' || (me && (me === b.author_uid || (await isAdminUid(me))));
    if (!canSee) return fail(res, 404, 'Not found');
    let likedByMe = false;
    if (me) {
      try {
        const { rows: lr } = await pool.query('SELECT 1 FROM blog_likes WHERE "blogId" = $1 AND uid = $2', [
          b.id,
          me,
        ]);
        likedByMe = lr.length > 0;
      } catch { /* ignore */ }
    }
    let moments = [];
    try {
      const { rows: mr } = await pool.query(
        `SELECT p.id, p.caption, p."uploadedByName", p."uploadedAt", p."likesCount",
          octet_length(p.data) AS bytes, p.aspect
         FROM blog_moments m JOIN photos p ON p.id = m."photoId"
         WHERE m."blogId" = $1 AND NOT COALESCE(p."_deleted", false)
         ORDER BY m.at ASC`,
        [b.id]
      );
      moments = mr.map((r) => ({
        id: r.id,
        url: Number(r.bytes || 0) > 0 ? momentBytesUrl(req, r.id) : '',
        caption: r.caption || '',
        uploadedByName: r.uploadedByName || '',
        uploadedAt: r.uploadedAt || '',
        likesCount: Number(r.likesCount || 0),
        ...(r.aspect ? { aspect: Number(r.aspect) } : {}),
      }));
    } catch { /* table missing — no embeds */ }
    pool.query('UPDATE blog_posts SET views = COALESCE(views, 0) + 1 WHERE id = $1', [b.id]).catch(() => undefined);
    res.json({
      data: {
        id: b.id,
        authorUid: b.author_uid,
        authorName: b.author_name || 'Someone',
        authorUsername: b.author_username || '',
        title: b.title || '',
        slug: b.slug || '',
        body: b.body || '',
        coverUrl: b.cover_url || '',
        tag: b.tag || 'journal',
        status: b.status,
        featured: !!b.featured,
        views: Number(b.views || 0) + 1,
        likesCount: Number(b.likeCount || 0),
        likedByMe,
        commentsCount: Number(b.commentCount || 0),
        createdAt: Number(b.createdAt || 0),
        updatedAt: Number(b.updatedAt || 0),
        moments,
      },
      error: null,
    });
  } catch (e) {
    console.error('GET /api/blogs/:id error:', e.message);
    res.json({ data: null, error: e.message });
  }
});

async function isAdminUid(uid) {
  try {
    const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [uid]);
    return rows[0]?.role === 'admin';
  } catch {
    return false;
  }
}

// POST /api/blogs — create draft (session). Returns the row.
app.post('/api/blogs', requireSession, async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim().slice(0, 120);
    const body = String(req.body?.body || '').slice(0, 50000);
    const coverUrl = String(req.body?.coverUrl || '').slice(0, 500);
    const tag = BLOG_TAGS.has(req.body?.tag) ? req.body.tag : 'journal';
    if (!title) return fail(res, 400, 'Title required');
    const id = 'blog_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const now = Date.now();
    await pool.query(
      'INSERT INTO blog_posts (id, author_uid, title, body, cover_url, tag, status, featured, views, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,\'draft\',false,0,$7,$7)',
      [id, req.user.id, title, body, coverUrl, tag, now]
    );
    res.json({ data: { id, status: 'draft' }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// PUT /api/blogs/:id — author edits own (published → back to pending),
// admin edits anything + sets status directly.
app.put('/api/blogs/:id', requireSession, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!BLOG_ID.test(id)) return fail(res, 400, 'Bad id');
    const { rows } = await pool.query('SELECT * FROM blog_posts WHERE id = $1', [id]);
    const b = rows[0];
    if (!b) return fail(res, 404, 'Not found');
    const admin = await isAdminUid(req.user.id);
    const mine = b.author_uid === req.user.id;
    if (!mine && !admin) return fail(res, 403, 'Only the author can edit');
    const sets = [];
    const vals = [];
    const push = (col, v) => {
      vals.push(v);
      sets.push(`"${col}" = $${vals.length}`);
    };
    if (req.body?.title !== undefined) push('title', String(req.body.title).trim().slice(0, 120));
    if (req.body?.body !== undefined) push('body', String(req.body.body).slice(0, 50000));
    if (req.body?.coverUrl !== undefined) push('cover_url', String(req.body.coverUrl).slice(0, 500));
    if (req.body?.tag !== undefined && BLOG_TAGS.has(req.body.tag)) push('tag', req.body.tag);
    if (admin && req.body?.status !== undefined && ['draft', 'pending', 'published', 'rejected'].includes(req.body.status)) {
      push('status', req.body.status);
      if (req.body.status === 'published' && !b.slug) push('slug', blogSlug(req.body?.title || b.title, id));
    } else if (mine && !admin && b.status === 'published' && sets.length > 0) {
      push('status', 'pending'); // re-review after editing published work
    }
    if (req.body?.featured !== undefined && admin) push('featured', !!req.body.featured);
    if (sets.length === 0) return res.json({ data: { id }, error: null });
    vals.push(Date.now());
    sets.push(`"updatedAt" = $${vals.length}`);
    vals.push(id);
    await pool.query(`UPDATE blog_posts SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
    res.json({ data: { id }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// POST /api/blogs/:id/submit — author sends draft/rejected → pending review.
app.post('/api/blogs/:id/submit', requireSession, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const { rows } = await pool.query('SELECT author_uid, status FROM blog_posts WHERE id = $1', [id]);
    if (!rows[0]) return fail(res, 404, 'Not found');
    if (rows[0].author_uid !== req.user.id) return fail(res, 403, 'Only the author can submit');
    if (!['draft', 'rejected'].includes(rows[0].status)) return fail(res, 400, 'Nothing to submit');
    await pool.query('UPDATE blog_posts SET status = \'pending\', "updatedAt" = $2 WHERE id = $1', [id, Date.now()]);
    res.json({ data: { id, status: 'pending' }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// POST /api/blogs/:id/review {approve} — admin only.
app.post('/api/blogs/:id/review', requireSession, async (req, res) => {
  try {
    if (!(await isAdminUid(req.user.id))) return fail(res, 403, 'Admin only');
    const id = String(req.params.id || '');
    const { rows } = await pool.query('SELECT * FROM blog_posts WHERE id = $1', [id]);
    if (!rows[0]) return fail(res, 404, 'Not found');
    const status = req.body?.approve ? 'published' : 'rejected';
    if (req.body?.approve && !rows[0].slug) {
      await pool.query('UPDATE blog_posts SET status = $2, slug = $3, "updatedAt" = $4 WHERE id = $1', [
        id,
        status,
        blogSlug(rows[0].title, id),
        Date.now(),
      ]);
    } else {
      await pool.query('UPDATE blog_posts SET status = $2, "updatedAt" = $3 WHERE id = $1', [id, status, Date.now()]);
    }
    res.json({ data: { id, status }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// POST /api/blogs/:id/feature {featured} — admin picks login-page cards.
app.post('/api/blogs/:id/feature', requireSession, async (req, res) => {
  try {
    if (!(await isAdminUid(req.user.id))) return fail(res, 403, 'Admin only');
    const id = String(req.params.id || '');
    await pool.query('UPDATE blog_posts SET featured = $2, "updatedAt" = $3 WHERE id = $1', [
      id,
      !!req.body?.featured,
      Date.now(),
    ]);
    res.json({ data: { id }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// POST /api/blogs/:id/move {dir} — admin reorders featured cards (up/down
// swaps sort_order with the neighbour). Touch-friendly, no drag needed.
app.post('/api/blogs/:id/move', requireSession, async (req, res) => {
  try {
    if (!(await isAdminUid(req.user.id))) return fail(res, 403, 'Admin only');
    const id = String(req.params.id || '');
    const dir = req.body?.dir === 'down' ? 1 : -1;
    // Normalize first (old rows all sit at 0 — swaps would no-op).
    await pool.query(
      `UPDATE blog_posts b SET sort_order = ranked.n FROM
       (SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order ASC, "updatedAt" DESC) - 1 AS n
        FROM blog_posts WHERE featured = true) AS ranked
       WHERE b.id = ranked.id`
    ).catch(() => undefined);
    const { rows } = await pool.query(
      `SELECT id, sort_order FROM blog_posts WHERE featured = true ORDER BY sort_order ASC, "updatedAt" DESC`,
    );
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return fail(res, 404, 'Not a featured post');
    const other = rows[idx + dir];
    if (!other) return res.json({ data: { id, moved: false }, error: null });
    await pool.query('UPDATE blog_posts SET sort_order = $2 WHERE id = $1', [id, other.sort_order]);
    await pool.query('UPDATE blog_posts SET sort_order = $2 WHERE id = $1', [other.id, rows[idx].sort_order]);
    res.json({ data: { id, moved: true }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// DELETE /api/blogs/:id — author or admin. Likes/comments/embeds cascade.
// Delete-everywhere: also hard-deletes the author's own photos embedded in
// this blog AND its dedicated cover upload, so My posts / timelines don't
// keep showing a deleted story's pics. Covers picked from the author's
// existing posts are left alone (still their posts).
app.delete('/api/blogs/:id', requireSession, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const { rows } = await pool.query('SELECT author_uid, cover_url FROM blog_posts WHERE id = $1', [id]);
    if (!rows[0]) return fail(res, 404, 'Not found');
    const author = rows[0].author_uid;
    const admin = await isAdminUid(req.user.id);
    if (author !== req.user.id && !admin) return fail(res, 403, 'Only the author can delete');
    const linked = await pool.query('SELECT "photoId" FROM blog_moments WHERE "blogId" = $1', [id]);
    const photoIds = linked.rows.map((r) => r.photoId).filter(Boolean);
    // Dedicated cover upload for this blog (flagged at upload, owned by the
    // author) — dies with the blog. Picked-from-existing covers stay.
    const coverPhotoId = photoIdFromCoverUrl(rows[0].cover_url);
    if (coverPhotoId) {
      const own = await pool.query(
        'SELECT id FROM photos WHERE id = $1 AND "uploadedByUid" = $2 AND COALESCE(is_cover, false) = true',
        [coverPhotoId, author]
      );
      if (own.rows[0]) photoIds.push(own.rows[0].id);
    }
    let deletedPhotos = [];
    if (photoIds.length > 0) {
      const own = await pool.query(
        'SELECT id FROM photos WHERE id = ANY($1) AND "uploadedByUid" = $2',
        [photoIds, author]
      );
      deletedPhotos = own.rows.map((r) => r.id);
      if (deletedPhotos.length > 0) {
        await pool.query('DELETE FROM photo_comments WHERE "photoId" = ANY($1)', [deletedPhotos]);
        await pool.query('DELETE FROM photo_likes WHERE "photoId" = ANY($1)', [deletedPhotos]);
        await pool.query('DELETE FROM photos WHERE id = ANY($1)', [deletedPhotos]);
      }
    }
    // blog_* side tables have no FK cascade — clean them explicitly.
    await pool.query('DELETE FROM blog_likes WHERE "blogId" = $1', [id]).catch(() => undefined);
    await pool.query('DELETE FROM blog_comments WHERE "blogId" = $1', [id]).catch(() => undefined);
    await pool.query('DELETE FROM blog_moments WHERE "blogId" = $1', [id]).catch(() => undefined);
    await pool.query('DELETE FROM blog_posts WHERE id = $1', [id]);
    res.json({ data: { id, deleted: true, deletedPhotos }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// Blog likes: POST/DELETE /api/blogs/:id/likes (session). Same row pattern.
app.post('/api/blogs/:id/likes', requireSession, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    await pool.query('INSERT INTO blog_likes ("blogId", uid, at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [
      id,
      req.user.id,
      Date.now(),
    ]);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM blog_likes WHERE "blogId" = $1', [id]);
    res.json({ data: { liked: true, count: rows[0]?.n || 0 }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

app.delete('/api/blogs/:id/likes', requireSession, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    await pool.query('DELETE FROM blog_likes WHERE "blogId" = $1 AND uid = $2', [id, req.user.id]);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM blog_likes WHERE "blogId" = $1', [id]);
    res.json({ data: { liked: false, count: rows[0]?.n || 0 }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// Blog comments: GET public, POST session, DELETE author-or-post-author.
app.get('/api/blogs/:id/comments', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const { rows } = await pool.query(
      'SELECT id, uid, name, text, at FROM blog_comments WHERE "blogId" = $1 ORDER BY at ASC LIMIT 200',
      [id]
    );
    res.json({ data: rows, error: null });
  } catch (e) {
    if (e && /blog_comments|relation/i.test(e.message || '')) return res.json({ data: [], error: null });
    res.json({ data: null, error: e.message });
  }
});

app.post('/api/blogs/:id/comments', requireSession, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const text = String(req.body?.text || '').trim().slice(0, 500);
    if (!text) return fail(res, 400, 'Comment is empty');
    const cid = 'bcm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const at = Date.now();
    await pool.query('INSERT INTO blog_comments (id, "blogId", uid, name, text, at) VALUES ($1,$2,$3,$4,$5,$6)', [
      cid,
      id,
      req.user.id,
      req.user.name || 'Someone',
      text,
      at,
    ]);
    res.json({ data: { id: cid, uid: req.user.id, name: req.user.name || 'Someone', text, at }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

app.delete('/api/blogs/:id/comments/:cid', requireSession, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const cid = String(req.params.cid || '');
    const { rows } = await pool.query(
      `SELECT c.uid AS "commentUid", p.author_uid AS "postUid" FROM blog_comments c
       LEFT JOIN blog_posts p ON p.id = c."blogId" WHERE c.id = $1 AND c."blogId" = $2`,
      [cid, id]
    );
    if (!rows[0]) return fail(res, 404, 'Not found');
    if (rows[0].commentUid !== req.user.id && rows[0].postUid !== req.user.id) {
      return fail(res, 403, 'Only the author can delete this comment');
    }
    await pool.query('DELETE FROM blog_comments WHERE id = $1', [cid]);
    res.json({ data: { id: cid }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// Blog ↔ moments: POST /api/blogs/:id/moments {photoIds[]} (own moments,
// own blogs only — both sides must belong to the session user; admin bypass
// intentionally NOT added). DELETE one link. Appended at the end, in order.
app.post('/api/blogs/:id/moments', requireSession, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const ids = [...new Set((Array.isArray(req.body?.photoIds) ? req.body.photoIds : []).map((x) => String(x || '')))]
      .filter((x) => MOMENT_ID.test(x))
      .slice(0, 20);
    const { rows } = await pool.query('SELECT author_uid FROM blog_posts WHERE id = $1', [id]);
    if (!rows[0]) return fail(res, 404, 'Not found');
    if (rows[0].author_uid !== req.user.id) return fail(res, 403, 'Only your own blogs');
    let added = 0;
    for (const pid of ids) {
      const { rows: pr } = await pool.query('SELECT "uploadedByUid" FROM photos WHERE id = $1', [pid]);
      if (!pr[0]) continue;
      // Legacy rows without uid: match by author name against session name.
      const mine = pr[0].uploadedByUid
        ? pr[0].uploadedByUid === req.user.id
        : false;
      if (!mine) continue;
      try {
        await pool.query('INSERT INTO blog_moments ("blogId", "photoId", at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [
          id,
          pid,
          Date.now(),
        ]);
        added++;
      } catch { /* missing table — skip */ }
    }
    res.json({ data: { id, added }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

app.delete('/api/blogs/:id/moments/:pid', requireSession, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const pid = String(req.params.pid || '');
    const { rows } = await pool.query('SELECT author_uid FROM blog_posts WHERE id = $1', [id]);
    if (!rows[0]) return fail(res, 404, 'Not found');
    if (rows[0].author_uid !== req.user.id) return fail(res, 403, 'Only your own blogs');
    await pool.query('DELETE FROM blog_moments WHERE "blogId" = $1 AND "photoId" = $2', [id, pid]);
    res.json({ data: { id }, error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// ─── Generic table CRUD (AFTER specific routes) ────────────

app.use('/api/:table', (req, res, next) => {
  // Public reads (registered below, but the gate runs first in file order):
  // moment rows/bytes + usage are fetched by <img> tags and logged-out
  // viewers, which can't send Authorization headers. Writes stay authed.
  if (req.method === 'GET' && (req.params.table === 'moments' || req.params.table === 'storage-usage')) {
    return next();
  }
  return requireSession(req, res, next);
});

// GET /api/:table — list rows with optional filters
// ─── Timeline moments: bytes live IN Postgres (any device sees them) ───
// ~80KB/photo. Rows list WITHOUT data (bytea never rides along); bytes come
// from /bytes with immutable caching. Registered BEFORE /:table on purpose.
const MOMENT_ID = /^[A-Za-z0-9_-]{1,64}$/;
function momentBytesUrl(req, id) {
  return `${req.protocol}://${req.get('host')}/api/moments/${id}/bytes`;
}

// POST /api/moments — upsert metadata (+ optional base64 bytes).
// tripId empty/omitted = MAIN timeline post (trip-less, public feed).
app.post('/api/moments', async (req, res) => {
  try {
    const b = req.body || {};
    const id = String(b.id || '');
    const tripId = String(b.tripId || '') || null;
    if (!MOMENT_ID.test(id)) return fail(res, 400, 'id required');
    let buf = null;
    const mime = String(b.mime || 'image/jpeg').slice(0, 64);
    const aspect = Number(b.aspect) > 0 ? Number(b.aspect) : null;
    const uploadedByUid = String(b.uploadedByUid || '').slice(0, 128) || null;
    // BlogComposer "Upload new" cover: dedicated trip-less moment, flagged so
    // feeds / My-posts never show it as a standalone post.
    const blogCover = b.blogCover === true || b.blogCover === 'true';
    if (typeof b.data === 'string' && b.data.length > 0) {
      const b64 = b.data.includes(',') ? b.data.split(',').pop() : b.data;
      if (b64.length > 15 * 1024 * 1024) return fail(res, 413, 'Photo too large');
      buf = Buffer.from(b64, 'base64');
      if (buf.length === 0 || buf.length > 12 * 1024 * 1024) return fail(res, 400, 'Bad image data');
    }
    try {
      await pool.query(
        `INSERT INTO photos (id, "tripId", caption, "locationTag", "uploadedByMemberId",
          "uploadedByName", "uploadedAt", "likesCount", mime, data, aspect, "uploadedByUid",
          "_deleted", "updatedAt", "updatedBy", is_cover)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,$13,$14,$15)
         ON CONFLICT (id) DO UPDATE SET
           caption = EXCLUDED.caption,
           "locationTag" = EXCLUDED."locationTag",
           "likesCount" = EXCLUDED."likesCount",
           mime = EXCLUDED.mime,
           data = COALESCE(EXCLUDED.data, photos.data),
           aspect = COALESCE(EXCLUDED.aspect, photos.aspect),
           "uploadedByUid" = COALESCE(EXCLUDED."uploadedByUid", photos."uploadedByUid"),
           "_deleted" = EXCLUDED."_deleted",
           "updatedAt" = EXCLUDED."updatedAt",
           "updatedBy" = EXCLUDED."updatedBy",
           is_cover = photos.is_cover OR EXCLUDED.is_cover`,
        [
          id, tripId,
          String(b.caption || '').slice(0, 500),
          String(b.locationTag || '').slice(0, 120),
          String(b.uploadedByMemberId || '').slice(0, 128),
          String(b.uploadedByName || '').slice(0, 128),
          String(b.uploadedAt || new Date().toISOString()).slice(0, 64),
          Number(b.likesCount || 0) || 0,
          mime, buf, aspect, uploadedByUid,
          Date.now(),
          String(b.updatedBy || b.uploadedByMemberId || '').slice(0, 128),
          blogCover,
        ]
      );
    } catch (e) {
      if (e && /uploadedByUid|aspect|is_cover/i.test(e.message || '')) {
        // Column not migrated yet — legacy write keeps posting alive.
        await pool.query(
          `INSERT INTO photos (id, "tripId", caption, "locationTag", "uploadedByMemberId",
            "uploadedByName", "uploadedAt", "likesCount", mime, data,
            "_deleted", "updatedAt", "updatedBy")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11,$12)
           ON CONFLICT (id) DO UPDATE SET
             caption = EXCLUDED.caption,
             "locationTag" = EXCLUDED."locationTag",
             "likesCount" = EXCLUDED."likesCount",
             mime = EXCLUDED.mime,
             data = COALESCE(EXCLUDED.data, photos.data),
             "_deleted" = EXCLUDED."_deleted",
             "updatedAt" = EXCLUDED."updatedAt",
             "updatedBy" = EXCLUDED."updatedBy"`,
          [
            id, tripId,
            String(b.caption || '').slice(0, 500),
            String(b.locationTag || '').slice(0, 120),
            String(b.uploadedByMemberId || '').slice(0, 128),
            String(b.uploadedByName || '').slice(0, 128),
            String(b.uploadedAt || new Date().toISOString()).slice(0, 64),
            Number(b.likesCount || 0) || 0,
            mime, buf,
            Date.now(),
            String(b.updatedBy || b.uploadedByMemberId || '').slice(0, 128),
          ]
        );
      } else throw e;
    }
    res.json({ data: { id, url: buf ? momentBytesUrl(req, id) : null, bytes: buf ? buf.length : 0 }, error: null });
  } catch (e) {
    console.error('POST /api/moments error:', e.message);
    res.json({ data: null, error: e.message });
  }
});

// GET /api/moments?tripId= — rows with computed URLs, never bytea
// PUBLIC on purpose (registered before the /:table auth gate): <img> tags
// can't send Authorization headers, same reason voice-clips are public.
app.get('/api/moments', async (req, res) => {
  try {
    const tripId = String(req.query.tripId || '');
    if (!tripId) return fail(res, 400, 'tripId required');
    // Optional viewer (public feed stays public): likedByMe only when a
    // valid session rides along — never 401s here.
    let me = null;
    try {
      const tok = bearerToken(req);
      if (tok) {
        const u = await userByToken(tok);
        if (u) me = u.id;
      }
    } catch { /* public read proceeds without identity */ }
    let rows;
    try {
      ({ rows } = await pool.query(
        `SELECT p.id, p."tripId", p.caption, p."locationTag", p."uploadedByMemberId",
          p."uploadedByName", p."uploadedAt", p."likesCount", p.mime, p.aspect, p."uploadedByUid",
          octet_length(p.data) AS bytes, p."updatedAt",
          (SELECT COUNT(*)::int FROM photo_likes l WHERE l."photoId" = p.id) AS "likeCount",
          CASE WHEN $2::text IS NULL THEN false
            ELSE EXISTS(SELECT 1 FROM photo_likes l WHERE l."photoId" = p.id AND l.uid = $2) END AS "likedByMe"
         FROM photos p WHERE p."tripId" = $1 AND NOT COALESCE(p."_deleted", false)
         ORDER BY p."uploadedAt" ASC LIMIT 500`,
        [tripId, me]
      ));
    } catch (e) {
      const legacyRead = async () => {
        // Columns not migrated yet — legacy read keeps the feed alive.
        const r = await pool.query(
          `SELECT id, "tripId", caption, "locationTag", "uploadedByMemberId",
            "uploadedByName", "uploadedAt", "likesCount", mime,
            octet_length(data) AS bytes, "updatedAt"
           FROM photos WHERE "tripId" = $1 AND NOT COALESCE("_deleted", false)
           ORDER BY "uploadedAt" ASC LIMIT 500`,
          [tripId]
        );
        return r.rows;
      };
      if (e && /photo_likes|relation/i.test(e.message || '')) {
        try {
          ({ rows } = await pool.query(
            `SELECT id, "tripId", caption, "locationTag", "uploadedByMemberId",
              "uploadedByName", "uploadedAt", "likesCount", mime, aspect, "uploadedByUid",
              octet_length(data) AS bytes, "updatedAt"
             FROM photos WHERE "tripId" = $1 AND NOT COALESCE("_deleted", false)
             ORDER BY "uploadedAt" ASC LIMIT 500`,
            [tripId]
          ));
        } catch (e2) {
          if (e2 && /uploadedByUid|aspect/i.test(e2.message || '')) {
            rows = await legacyRead();
          } else throw e2;
        }
      } else if (e && /uploadedByUid|aspect/i.test(e.message || '')) {
        rows = await legacyRead();
      } else throw e;
    }
    res.json({
      data: rows.map((r) => ({
        id: r.id,
        tripId: r.tripId,
        url: r.bytes > 0 ? momentBytesUrl(req, r.id) : '',
        caption: r.caption || '',
        locationTag: r.locationTag || '',
        uploadedByMemberId: r.uploadedByMemberId || '',
        uploadedByName: r.uploadedByName || '',
        uploadedAt: r.uploadedAt || '',
        likesCount: Number(r.likeCount ?? r.likesCount ?? 0),
        likedByMe: !!r.likedByMe,
        bytes: Number(r.bytes || 0),
        ...(r.aspect ? { aspect: Number(r.aspect) } : {}),
        ...(r.uploadedByUid ? { uploadedByUid: r.uploadedByUid } : {}),
      })),
      error: null,
    });
  } catch (e) {
    console.error('GET /api/moments error:', e.message);
    res.json({ data: null, error: e.message });
  }
});

// GET /api/moments/one/:id — single moment by id (capability URL for
// timeline links pasted into blogs; ids are unguessable).
app.get('/api/moments/one/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!MOMENT_ID.test(id)) return fail(res, 400, 'Bad id');
    let me = null;
    try {
      const tok = bearerToken(req);
      if (tok) {
        const u = await userByToken(tok).catch(() => null);
        if (u) me = u.id;
      }
    } catch { /* public read proceeds */ }
    const { rows } = await pool.query(
      `SELECT p.id, p."tripId", p.caption, p."locationTag", p."uploadedByMemberId",
        p."uploadedByName", p."uploadedAt", p."likesCount", p.mime, p.aspect, p."uploadedByUid",
        octet_length(p.data) AS bytes,
        (SELECT COUNT(*)::int FROM photo_likes l WHERE l."photoId" = p.id) AS "likeCount",
        CASE WHEN $2::text IS NULL THEN false
          ELSE EXISTS(SELECT 1 FROM photo_likes l WHERE l."photoId" = p.id AND l.uid = $2) END AS "likedByMe"
       FROM photos p WHERE p.id = $1 AND NOT COALESCE(p."_deleted", false)`,
      [id, me]
    );
    const r = rows[0];
    if (!r) return fail(res, 404, 'Not found');
    res.json({
      data: {
        id: r.id,
        tripId: r.tripId,
        url: Number(r.bytes || 0) > 0 ? momentBytesUrl(req, r.id) : '',
        caption: r.caption || '',
        locationTag: r.locationTag || '',
        uploadedByMemberId: r.uploadedByMemberId || '',
        uploadedByName: r.uploadedByName || '',
        uploadedAt: r.uploadedAt || '',
        likesCount: Number(r.likeCount ?? r.likesCount ?? 0),
        likedByMe: !!r.likedByMe,
        bytes: Number(r.bytes || 0),
        ...(r.aspect ? { aspect: Number(r.aspect) } : {}),
        ...(r.uploadedByUid ? { uploadedByUid: r.uploadedByUid } : {}),
      },
      error: null,
    });
  } catch (e) {
    if (e && /photo_likes|relation/i.test(e.message || '')) {
      try {
        const { rows } = await pool.query(
          `SELECT id, "tripId", caption, "locationTag", "uploadedByMemberId",
            "uploadedByName", "uploadedAt", "likesCount", mime, aspect, "uploadedByUid",
            octet_length(data) AS bytes
           FROM photos WHERE id = $1 AND NOT COALESCE("_deleted", false)`,
          [String(req.params.id || '')]
        );
        const r = rows[0];
        if (!r) return fail(res, 404, 'Not found');
        return res.json({
          data: {
            id: r.id,
            tripId: r.tripId,
            url: Number(r.bytes || 0) > 0 ? momentBytesUrl(req, r.id) : '',
            caption: r.caption || '',
            locationTag: r.locationTag || '',
            uploadedByMemberId: r.uploadedByMemberId || '',
            uploadedByName: r.uploadedByName || '',
            uploadedAt: r.uploadedAt || '',
            likesCount: Number(r.likesCount || 0),
            bytes: Number(r.bytes || 0),
            ...(r.aspect ? { aspect: Number(r.aspect) } : {}),
            ...(r.uploadedByUid ? { uploadedByUid: r.uploadedByUid } : {}),
          },
          error: null,
        });
      } catch (e2) {
        return fail(res, 500, e2.message);
      }
    }
    res.json({ data: null, error: e.message });
  }
});

// GET /api/moments/:id/bytes — the actual pixels (immutable, cached 1yr)
app.get('/api/moments/:id/bytes', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!MOMENT_ID.test(id)) return fail(res, 400, 'Bad id');
    const { rows } = await pool.query(
      'SELECT data, mime FROM photos WHERE id = $1 AND NOT COALESCE("_deleted", false)',
      [id]
    );
    const row = rows[0];
    if (!row || !row.data) return fail(res, 404, 'Gone');
    res.set('Content-Type', row.mime || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(row.data);
  } catch (e) {
    console.error('GET /api/moments bytes error:', e.message);
    res.json({ data: null, error: e.message });
  }
});

// DELETE /api/moments/:id — owner-only tombstone + bytes freed immediately.
// Delete-everywhere: also hard-deletes the author's own blogs embedding this
// photo OR using it as cover, so Discover doesn't keep showing a story whose
// post was deleted from My posts.
app.delete('/api/moments/:id', requireSession, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!MOMENT_ID.test(id)) return fail(res, 400, 'Bad id');
    const { rows } = await pool.query('SELECT "uploadedByUid" FROM photos WHERE id = $1', [id]);
    if (rows.length === 0) return fail(res, 404, 'Not found');
    const owner = rows[0].uploadedByUid || null;
    if (owner && owner !== req.user.id) return fail(res, 403, 'Only the author can delete this post');
    const who = owner || req.user.id;
    const embedded = await pool.query(
      'SELECT DISTINCT m."blogId" FROM blog_moments m JOIN blog_posts b ON b.id = m."blogId" WHERE m."photoId" = $1 AND b.author_uid = $2',
      [id, who]
    );
    const blogIds = embedded.rows.map((r) => r.blogId).filter(Boolean);
    // Blogs using this photo as COVER (cover_url, not a blog_moments row):
    // position() = literal substring match (LIKE would treat _ as wildcard).
    const covered = await pool.query(
      `SELECT b.id FROM blog_posts b WHERE b.author_uid = $2
        AND position('/api/moments/' || $1 || '/bytes' in b.cover_url) > 0`,
      [id, who]
    ).catch(() => ({ rows: [] }));
    for (const r of covered.rows) {
      if (r && r.id && !blogIds.includes(r.id)) blogIds.push(r.id);
    }
    await pool.query('DELETE FROM photo_comments WHERE "photoId" = $1', [id]);
    await pool.query('DELETE FROM photo_likes WHERE "photoId" = $1', [id]);
    await pool.query(
      'UPDATE photos SET "_deleted" = true, data = NULL, "updatedAt" = $2 WHERE id = $1',
      [id, Date.now()]
    );
    let deletedBlogs = [];
    if (blogIds.length > 0) {
      const del = await pool.query('DELETE FROM blog_posts WHERE id = ANY($1) RETURNING id', [blogIds]);
      deletedBlogs = del.rows.map((r) => r.id);
      // blog_* side tables have no FK cascade — clean them explicitly.
      await pool.query('DELETE FROM blog_likes WHERE "blogId" = ANY($1)', [blogIds]).catch(() => undefined);
      await pool.query('DELETE FROM blog_comments WHERE "blogId" = ANY($1)', [blogIds]).catch(() => undefined);
      await pool.query('DELETE FROM blog_moments WHERE "blogId" = ANY($1)', [blogIds]).catch(() => undefined);
    }
    try {
      await pool.query('VACUUM photos');
    } catch (e) {
      console.error('VACUUM photos after delete failed (delete itself ok):', e.message);
    }
    res.json({ data: { id, deletedBlogs }, error: null });
  } catch (e) {
    console.error('DELETE /api/moments error:', e.message);
    res.json({ data: null, error: e.message });
  }
});

// GET /api/feed/main — PUBLIC main timeline: trip-less posts from EVERY
// registered user, latest first. Session required (registered eyes only).
app.get('/api/feed/main', requireSession, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const before = Number(req.query.before) || Date.now() + 1;
    const q = String(req.query.q || '').trim().slice(0, 40);
    const me = req.user.id;
    let rows;
    try {
      ({ rows } = await pool.query(
        `SELECT p.id, p."tripId", p.caption, p."locationTag", p."uploadedByMemberId",
          p."uploadedByName", p."uploadedAt", p."likesCount", p.mime, p.aspect, p."uploadedByUid",
          octet_length(p.data) AS bytes,
          (SELECT COUNT(*)::int FROM photo_likes l WHERE l."photoId" = p.id) AS "likeCount",
          EXISTS(SELECT 1 FROM photo_likes l WHERE l."photoId" = p.id AND l.uid = $3) AS "likedByMe"
         FROM photos p
         WHERE p."tripId" IS NULL AND NOT COALESCE(p."_deleted", false)
           AND NOT COALESCE(p.is_cover, false)
           AND COALESCE(p."uploadedAt", '') < to_char(to_timestamp($1 / 1000.0), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           AND ($4 = '' OR p.caption ILIKE '%' || $4 || '%' OR p."uploadedByName" ILIKE '%' || $4 || '%')
         ORDER BY p."uploadedAt" DESC LIMIT $2`,
        [before, limit, me, q]
      ));
    } catch (e) {
      if (!(e && /photo_likes|relation/i.test(e.message || ''))) throw e;
      ({ rows } = await pool.query(
        `SELECT id, "tripId", caption, "locationTag", "uploadedByMemberId",
          "uploadedByName", "uploadedAt", "likesCount", mime, aspect, "uploadedByUid",
          octet_length(data) AS bytes
         FROM photos
         WHERE "tripId" IS NULL AND NOT COALESCE("_deleted", false)
           AND NOT COALESCE(is_cover, false)
           AND COALESCE("uploadedAt", '') < to_char(to_timestamp($1 / 1000.0), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           AND ($3 = '' OR caption ILIKE '%' || $3 || '%' OR "uploadedByName" ILIKE '%' || $3 || '%')
         ORDER BY "uploadedAt" DESC LIMIT $2`,
        [before, limit, q]
      ));
    }
    res.json({
      data: rows.map((r) => ({
        id: r.id,
        tripId: null,
        url: Number(r.bytes || 0) > 0 ? momentBytesUrl(req, r.id) : '',
        caption: r.caption || '',
        locationTag: r.locationTag || '',
        uploadedByMemberId: r.uploadedByMemberId || '',
        uploadedByName: r.uploadedByName || '',
        uploadedAt: r.uploadedAt || '',
        likesCount: Number(r.likeCount ?? r.likesCount ?? 0),
        likedByMe: !!r.likedByMe,
        bytes: Number(r.bytes || 0),
        ...(r.aspect ? { aspect: Number(r.aspect) } : {}),
        ...(r.uploadedByUid ? { uploadedByUid: r.uploadedByUid } : {}),
      })),
      error: null,
    });
  } catch (e) {
    console.error('GET /api/feed/main error:', e.message);
    res.json({ data: null, error: e.message });
  }
});

// GET /api/users/public/:uid — safe public bits for profile pages.
// Never email/phone/hash. Session required (registered eyes only).
app.get('/api/users/public/:uid', requireSession, async (req, res) => {
  try {
    const uid = String(req.params.uid || '');
    if (!uid) return fail(res, 400, 'uid required');
    const { rows } = await pool.query(
      'SELECT id, name, username, gender FROM users WHERE id = $1',
      [uid]
    );
    if (rows.length === 0) return fail(res, 404, 'User not found');
    res.json({ data: rows[0], error: null });
  } catch (e) {
    res.json({ data: null, error: e.message });
  }
});

// GET /api/feed/user/:uid — MAIN (trip-less) posts by one user, latest first.
// Trip posts stay inside their trips (privacy); this is the public grid.
app.get('/api/feed/user/:uid', requireSession, async (req, res) => {
  try {
    const uid = String(req.params.uid || '');
    if (!uid) return fail(res, 400, 'uid required');
    const limit = Math.min(Math.max(Number(req.query.limit) || 60, 1), 100);
    const me = req.user.id;
    let rows;
    try {
      ({ rows } = await pool.query(
        `SELECT p.id, p."tripId", p.caption, p."locationTag", p."uploadedByMemberId",
          p."uploadedByName", p."uploadedAt", p."likesCount", p.mime, p.aspect, p."uploadedByUid",
          octet_length(p.data) AS bytes,
          (SELECT COUNT(*)::int FROM photo_likes l WHERE l."photoId" = p.id) AS "likeCount",
          EXISTS(SELECT 1 FROM photo_likes l WHERE l."photoId" = p.id AND l.uid = $3) AS "likedByMe"
         FROM photos p
         WHERE p."tripId" IS NULL AND NOT COALESCE(p."_deleted", false)
           AND NOT COALESCE(p.is_cover, false)
           AND p."uploadedByUid" = $1
         ORDER BY p."uploadedAt" DESC LIMIT $2`,
        [uid, limit, me]
      ));
    } catch (e) {
      if (!(e && /photo_likes|relation/i.test(e.message || ''))) throw e;
      ({ rows } = await pool.query(
        `SELECT id, "tripId", caption, "locationTag", "uploadedByMemberId",
          "uploadedByName", "uploadedAt", "likesCount", mime, aspect, "uploadedByUid",
          octet_length(data) AS bytes
         FROM photos
         WHERE "tripId" IS NULL AND NOT COALESCE("_deleted", false)
           AND NOT COALESCE(is_cover, false)
           AND "uploadedByUid" = $1
         ORDER BY "uploadedAt" DESC LIMIT $2`,
        [uid, limit]
      ));
    }
    res.json({
      data: rows.map((r) => ({
        id: r.id,
        tripId: null,
        url: Number(r.bytes || 0) > 0 ? momentBytesUrl(req, r.id) : '',
        caption: r.caption || '',
        locationTag: r.locationTag || '',
        uploadedByMemberId: r.uploadedByMemberId || '',
        uploadedByName: r.uploadedByName || '',
        uploadedAt: r.uploadedAt || '',
        likesCount: Number(r.likeCount ?? r.likesCount ?? 0),
        likedByMe: !!r.likedByMe,
        bytes: Number(r.bytes || 0),
        ...(r.aspect ? { aspect: Number(r.aspect) } : {}),
        ...(r.uploadedByUid ? { uploadedByUid: r.uploadedByUid } : {}),
      })),
      error: null,
    });
  } catch (e) {
    console.error('GET /api/feed/user error:', e.message);
    res.json({ data: null, error: e.message });
  }
});

// ─── Relational likes: one row per (photo, user) ──────────────────────────
// POST /api/likes {photoId} → insert (idempotent) · DELETE /api/likes/:photoId
// → delete row (unlike) · GET /api/likes/mine → my liked photoIds.
// Both return the live {count, liked} so every screen shows identical state.
async function likeCountFor(photoId) {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM photo_likes WHERE "photoId" = $1', [photoId]);
  return rows[0]?.n || 0;
}

app.get('/api/likes/mine', requireSession, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT "photoId" FROM photo_likes WHERE uid = $1', [req.user.id]);
    res.json({ data: rows.map((r) => r.photoId), error: null });
  } catch (e) {
    if (e && /photo_likes|relation/i.test(e.message || '')) return res.json({ data: [], error: null });
    res.json({ data: null, error: e.message });
  }
});

app.post('/api/likes', requireSession, async (req, res) => {
  try {
    const photoId = String(req.body?.photoId || '');
    if (!MOMENT_ID.test(photoId)) return fail(res, 400, 'photoId required');
    await pool.query(
      'INSERT INTO photo_likes ("photoId", uid, at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [photoId, req.user.id, Date.now()]
    );
    res.json({ data: { photoId, liked: true, count: await likeCountFor(photoId) }, error: null });
  } catch (e) {
    console.error('POST /api/likes error:', e.message);
    res.json({ data: null, error: e.message });
  }
});

app.delete('/api/likes/:photoId', requireSession, async (req, res) => {
  try {
    const photoId = String(req.params.photoId || '');
    if (!MOMENT_ID.test(photoId)) return fail(res, 400, 'photoId required');
    await pool.query('DELETE FROM photo_likes WHERE "photoId" = $1 AND uid = $2', [photoId, req.user.id]);
    res.json({ data: { photoId, liked: false, count: await likeCountFor(photoId) }, error: null });
  } catch (e) {
    console.error('DELETE /api/likes error:', e.message);
    res.json({ data: null, error: e.message });
  }
});

// ─── Post comments: text only, author from session (never client-supplied) ──
// Session-gated both ways (the /:table gate 401s token-less GETs anyway).
// GET /api/comments?photoId= · POST /api/comments {photoId, text}
app.get('/api/comments', requireSession, async (req, res) => {
  try {
    const photoId = String(req.query.photoId || '');
    if (!MOMENT_ID.test(photoId)) return fail(res, 400, 'photoId required');
    const { rows } = await pool.query(
      `SELECT c.id, c."photoId", c.uid, c.name, c.text, c.at
       FROM photo_comments c WHERE c."photoId" = $1 ORDER BY c.at ASC LIMIT 200`,
      [photoId]
    );
    res.json({ data: rows, error: null });
  } catch (e) {
    if (e && /photo_comments|relation/i.test(e.message || '')) return res.json({ data: [], error: null });
    console.error('GET /api/comments error:', e.message);
    res.json({ data: null, error: e.message });
  }
});

// GET /api/comments/counts?ids=a,b,c — comment counts for grids/hover.
app.get('/api/comments/counts', requireSession, async (req, res) => {
  try {
    const ids = String(req.query.ids || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => MOMENT_ID.test(s))
      .slice(0, 100);
    if (ids.length === 0) return res.json({ data: {}, error: null });
    const { rows } = await pool.query(
      'SELECT "photoId", COUNT(*)::int AS n FROM photo_comments WHERE "photoId" = ANY($1) GROUP BY "photoId"',
      [ids]
    );
    const out = {};
    for (const r of rows) out[r.photoId] = r.n;
    res.json({ data: out, error: null });
  } catch (e) {
    if (e && /photo_comments|relation/i.test(e.message || '')) return res.json({ data: {}, error: null });
    res.json({ data: null, error: e.message });
  }
});

// DELETE /api/comments/:id — comment author OR post author (cleanup duty).
app.delete('/api/comments/:id', requireSession, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!/^cmt_[A-Za-z0-9_-]{1,64}$/.test(id)) return fail(res, 400, 'Bad id');
    const { rows } = await pool.query(
      `SELECT c.uid AS "commentUid", p."uploadedByUid" AS "postUid"
       FROM photo_comments c LEFT JOIN photos p ON p.id = c."photoId"
       WHERE c.id = $1`,
      [id]
    );
    if (rows.length === 0) return fail(res, 404, 'Not found');
    const allowed = rows[0].commentUid === req.user.id || (rows[0].postUid && rows[0].postUid === req.user.id);
    if (!allowed) return fail(res, 403, 'Only the author can delete this comment');
    await pool.query('DELETE FROM photo_comments WHERE id = $1', [id]);
    res.json({ data: { id }, error: null });
  } catch (e) {
    console.error('DELETE /api/comments error:', e.message);
    res.json({ data: null, error: e.message });
  }
});

app.post('/api/comments', requireSession, async (req, res) => {
  try {
    const photoId = String(req.body?.photoId || '');
    const text = String(req.body?.text || '').trim().slice(0, 500);
    if (!MOMENT_ID.test(photoId)) return fail(res, 400, 'photoId required');
    if (!text) return fail(res, 400, 'Comment is empty');
    const id = 'cmt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const at = Date.now();
    await pool.query(
      'INSERT INTO photo_comments (id, "photoId", uid, name, text, at) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, photoId, req.user.id, req.user.name || 'Someone', text, at]
    );
    res.json({ data: { id, photoId: photoId, uid: req.user.id, name: req.user.name || 'Someone', text, at }, error: null });
  } catch (e) {
    console.error('POST /api/comments error:', e.message);
    res.json({ data: null, error: e.message });
  }
});

// GET /api/storage-usage — LIVE server DB numbers (total + per-table + trip)
app.get('/api/storage-usage', async (req, res) => {
  try {
    const tripId = String(req.query.tripId || '');
    const db = await pool.query('SELECT pg_database_size(current_database()) AS bytes');
    const tables = await pool.query(
      `SELECT relname AS name, pg_total_relation_size(oid) AS bytes FROM pg_class
       WHERE relkind = 'r' AND relname IN
       ('trips','expenses','todos','documents','settlements','expense_events',
        'chat_messages','photos','signals','presence','members_joined',
        'push_tokens','invites','message_reads','users','auth_sessions')`
    );
    let trip = { photos: 0, photoBytes: 0 };
    if (tripId) {
      const t = await pool.query(
        `SELECT COUNT(*) AS n, COALESCE(SUM(octet_length(data)), 0) AS b FROM photos
         WHERE "tripId" = $1 AND NOT COALESCE("_deleted", false) AND data IS NOT NULL`,
        [tripId]
      );
      trip = { photos: Number(t.rows[0]?.n || 0), photoBytes: Number(t.rows[0]?.b || 0) };
    }
    const tableMap = {};
    for (const r of tables.rows) tableMap[r.name] = Number(r.bytes || 0);
    res.json({
      data: { dbBytes: Number(db.rows[0]?.bytes || 0), tables: tableMap, trip },
      error: null,
    });
  } catch (e) {
    console.error('GET /api/storage-usage error:', e.message);
    res.json({ data: null, error: e.message });
  }
});

app.get('/api/:table', async (req, res) => {
  try {
    const { table } = req.params;
    if (!checkTable(table)) return fail(res, 404, 'Unknown table');
    const { single, order, ascending, ...filters } = req.query;
    if (!checkIdents([...Object.keys(filters), ...(order ? [order] : [])])) {
      return fail(res, 400, 'Invalid column');
    }

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

// ─── Generic table guard: table + identifiers come from the URL/body, so
// allowlist them. Without this any authenticated caller could inject SQL
// through a crafted table or column name.
const KNOWN_TABLES = new Set([
  'trips', 'expenses', 'todos', 'documents', 'settlements', 'expense_events',
  'chat_messages', 'invites', 'members_joined', 'presence', 'push_tokens',
  'signals', 'message_reads', 'users',
]);
const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
function checkTable(table) {
  return typeof table === 'string' && KNOWN_TABLES.has(table);
}
function checkIdents(names) {
  return names.every((n) => typeof n === 'string' && SAFE_IDENT.test(n));
}

// POST /api/:table — upsert
app.post('/api/:table', async (req, res) => {
  try {
    const { table } = req.params;
    if (!checkTable(table)) return fail(res, 404, 'Unknown table');
    const body = req.body;
    // Same rule as PUT: password hashes never enter via generic upsert.
    const rows = Array.isArray(body) ? body : [body];
    if (table === 'users') {
      for (const r of rows) delete r.password_hash;
    }
    // Ghost-trip guard (Luxmi case): a trip without ownerUid is rejected by
    // NOT NULL and later wiped client-side = total data loss. The session is
    // authenticated here, so stamp the owner from it — never trust the client.
    if (table === 'trips') {
      for (const r of rows) {
        if (!r.ownerUid && req.user && req.user.id) r.ownerUid = req.user.id;
      }
    }
    // Chat sends: stamp the author from the session (never trust the client)
    // + refuse DM/group rooms the sender no longer belongs to (unfriend/removed).
    if (table === 'chat_messages') {
      for (const r of rows) {
        if (req.user && req.user.id) r.senderId = req.user.id;
        const ok = await canSendInRoom(r.senderId, String(r.tripId || ''), String(r.type || 'text'));
        if (!ok) return fail(res, 403, 'You are no longer a member of this chat');
      }
    }
    if (rows.length === 0) return res.json({ data: [], error: null });

    const cols = Object.keys(rows[0]);
    if (!checkIdents(cols)) return fail(res, 400, 'Invalid column');
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
    if (!checkTable(table)) return fail(res, 404, 'Unknown table');
    const { _filters, ...updates } = req.body;
    // Password hashes can only be written through the auth/admin endpoints
    // (which bcrypt them) — never as plaintext via generic update.
    if (table === 'users') delete updates.password_hash;
    const filters = _filters || {};
    if (!checkIdents([...Object.keys(updates), ...Object.keys(filters)])) {
      return fail(res, 400, 'Invalid column');
    }

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
    // Refuse unfiltered mass update (would rewrite the whole table).
    if (conds.length === 0) return fail(res, 400, 'Update needs a filter');

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
    if (!checkTable(table)) return fail(res, 404, 'Unknown table');
    const filters = req.query;
    if (!checkIdents(Object.keys(filters))) {
      return fail(res, 400, 'Invalid column');
    }

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
    else return fail(res, 400, 'Delete needs a filter');

    await pool.query(sql, vals);
    res.json({ data: null, error: null });
  } catch (e) {
    console.error('DELETE error:', e.message);
    res.json({ data: null, error: e.message });
  }
});

// Unknown API route — always the envelope, never an HTML stack page.
app.use('/api', (req, res) => fail(res, 404, 'Unknown endpoint'));

// Last net: any uncaught error becomes a 500 envelope (never leaks a stack).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled API error:', err && err.message);
  if (res.headersSent) return next(err);
  return fail(res, 500, 'Server error. Try again.');
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
      // Anti-spoof: a tracked socket may only send as itself.
      const sockUid = socket.data ? socket.data.uid : null;
      if (sockUid && senderId && senderId !== sockUid) {
        if (ack) ack({ error: 'sender mismatch' });
        return;
      }
      // Removed/unfriended senders are refused in DM/group rooms.
      const ok = await canSendInRoom(senderId || sockUid, tid, type || 'text');
      if (!ok) {
        if (ack) ack({ error: 'You are no longer a member of this chat' });
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
      // Closed-app reach (WhatsApp-style): offline members get a system
      // notification; online ones already saw it live. Never blocks send.
      void fanOutChat({ tripId: tid, senderId, senderName, type: type || 'text', text });
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

  // ── WebRTC signaling relay (call groundwork) ──────────────────────
  // Stateless room-scoped forward for SDP offer/answer + ICE candidates.
  // No media ever touches the server — pure peer-to-peer afterwards.
  // Clients open data channels / media on top (see src/utils/webrtc.ts).
  for (const ev of ['call:hello', 'call:offer', 'call:answer', 'call:ice', 'call:hangup']) {
    socket.on(ev, (payload) => {
      try {
        const tid = payload && payload.tripId;
        if (!tid || typeof tid !== 'string') return;
        socket.to(roomOf(tid)).emit(ev, payload);
      } catch (e) {
        console.error('call relay error:', e.message);
      }
    });
  }
});

httpServer.listen(PORT, () => {
  console.log(`WanderSync API + realtime running on http://localhost:${PORT}`);
});
