const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
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
app.listen(PORT, () => {
  console.log(`WanderSync API running on http://localhost:${PORT}`);
});
