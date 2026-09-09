const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const http = require('http');
const { Server } = require('socket.io');
const pool = require('./db.cjs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── Specific routes FIRST (before generic /:table) ────────

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT NOW()');
    res.json({ ok: true, time: rows[0].now });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

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

    res.json({ data: { user: { id, email }, token: id }, error: null });
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

    res.json({ data: { user: { id: user.id, email: user.email }, token: user.id }, error: null });
  } catch (e) {
    console.error('Signin error:', e.message);
    res.json({ data: null, error: e.message });
  }
});

// Auth: get current user
app.get('/api/auth/user', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.json({ data: { user: null }, error: null });

    const { rows } = await pool.query('SELECT id, email, name, phone, role FROM users WHERE id = $1', [token]);
    if (rows.length === 0) return res.json({ data: { user: null }, error: null });

    res.json({ data: { user: rows[0] }, error: null });
  } catch (e) {
    res.json({ data: { user: null }, error: e.message });
  }
});

// ─── Generic table CRUD (AFTER specific routes) ────────────

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
    const rows = Array.isArray(body) ? body : [body];
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

const PORT = 3001;
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
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
