# WanderSync Architecture Guide — Instagram-style on a Free Tier

> One file: the full WHY behind every tech choice, our free-tier math,
> and a master AI prompt to build what comes next.
> Read this before touching photos, storage, or feed code.

---

## Part 0: Our Actual Stack (honest map, no hype)

| Instagram | Supabase cloud (the article) | **WanderSync (us, today)** |
|---|---|---|
| Sharded Postgres (metadata) | Supabase Postgres 500MB | Express + Postgres (local dev / Neon prod) — metadata rows |
| Haystack/f4 (object store) | Supabase Storage 1GB | **Nothing yet** — photo bytes live in PG `photos.data` (bytea) + phone IndexedDB copy |
| Redis/Memcache (cache) | Realtime + CDN cache | Socket.io rooms (chat already live) + `<img>` cache headers (moments `/bytes` = 1yr immutable) |
| Cassandra (feed) | Postgres JSONB | Postgres rows (our scale doesn't need Cassandra) |
| ML embeddings feed | pgvector | Not installed — Phase 3, optional |
| Geo discovery | PostGIS | Not installed — Phase 3, optional |

**The one line that matters:** the article says *"don't store files as bytea"* —
right now **we do exactly that** (`photos.data bytea`). It works and the
meter watches it, but the world-class move is the split below. That migration
is Phase 2. Nothing breaks until then.

---

## Part 1: The WHY (every decision, no magic)

### 1.1 Client-side compression (the bandwidth gatekeeper)

- **Why on the phone, not the server?** A raw 10MB upload drains battery,
  feels slow, and chokes bandwidth. The phone does the heavy lifting once;
  the server only ever sees small bytes.
- **Why staged resize (4000px → 2000px → 1600px)?** One giant jump smears
  fine detail (faces). Halving in stages keeps edges crisp. Same reason
  Instagram resizes in steps. (`src/utils/image.ts` → `drawStepped`)
- **Why smoothing HIGH?** Canvas defaults to `'low'` (bilinear mush) and
  resizing resets it silently — we re-arm after every step. This single flag
  was our biggest blur source.
- **Why libavif (WASM) first?** Real AV1 encoder (Squoosh-grade), ~30-50%
  smaller than WebP at the same look. Loads on demand (`public/codec/*.wasm`,
  cached after first use). Falls back: MozJPEG (WASM) → canvas ladder.
  Any failure → original bytes. **A blank photo is impossible by construction**
  (prefix + min-bytes + decode-verify gates).
- **Why quality floors, never mush?** Resolution drops first (1600→1280→1080),
  quality never goes below WebP 0.58 / AVIF 0.44. A small sharp photo beats a
  big blurry one on every phone screen.

### 1.2 The Storage vs Database split (the core secret)

- **Why separate?** Postgres stores data in structured pages. Force binary
  blobs into rows and every simple query drags megabytes into RAM; backups
  bloat; the 500MB quota evaporates. Text URLs are <1KB and index/sort in
  milliseconds.
- **How it works (target state):** bytes → object store (file), Postgres row
  holds only the URL string + caption + timestamps.
- **Where we are today:** bytes in `photos.data` (bytea) + URL computed as
  `/api/moments/:id/bytes`. Device keeps a Blob copy (`localRef`) for
  instant offline render. Meter (`GET /api/storage-usage`) watches both
  total DB and per-trip photo bytes live.

### 1.3 Why Postgres (not NoSQL)

- Relationships are real: a comment can't outlive its post (`ON DELETE CASCADE`),
  a photo can't point at a missing trip (FK rejected our probe insert — that's
  the guard working). NoSQL makes you enforce this by hand, forever.
- One engine does rows + JSONB + (later) geo + vectors. Fewer services = fewer bills.

### 1.4 Realtime without Supabase Realtime

- We have Socket.io rooms (`joinTripRoom`) — chat already rides it. Moments
  poll every 20s today (backend has no changefeed); moving moment events onto
  the socket is a small Phase-2 win, not new infrastructure.

---

## Part 2: Free-tier math (live numbers, not wishes)

Supabase free (if/when we use Supabase cloud): **500MB DB** (read-only beyond),
**1GB storage**, 5GB egress/month, pause after 1 week idle.

Our reality today (Neon/local Postgres — same 500MB order of magnitude):

| Load | Bytes | % of 500MB |
|---|---|---|
| Empty-ish DB (system catalogs) | ~9MB | ~2% |
| 500 trip photos × ~80KB | ~40MB | ~8% |
| 5,000 photos × ~80KB | ~400MB | ~80% → migrate bytes to object store before here |

Honest correction to the article's "25KB" claim: size is **content-dependent**.
Flat posters compress tiny; detailed 9MB group shots land ~70-120KB sharp.
Anyone promising "always 25KB, same quality" is selling, not engineering.
Our ladder targets ~70KB and shows the real number per upload — trust the meter.

---

## Part 3: Build phases (in order, no skipping)

- **Phase 1 — DONE:** WASM pipeline, validation gates, Blob device store,
  server `photos` table, live usage meter, owner edit/delete with full wipe.
- **Phase 2 — the split (next):** move bytes PG → object store
  (Supabase Storage 1GB free *or* server disk), rows keep URL strings.
  Effort: new upload path + backfill old rows + meter reads both stores.
  Trigger: `photos` table approaching ~300MB, or anytime we want cloud URLs.
- **Phase 3 — crazy (optional):** PostGIS nearby-moments, pgvector similar-vibes
  feed. Needs: extensions installed + an embedding source (browser-side
  Transformers.js = free but heavy; API = costs). Only after Phase 2.

---

## Part 4: Master AI prompt (copy-paste to build Phase 2/3)

```text
You are a senior full-stack engineer working in the WanderSync repo
(Express + Postgres backend in server/, React + Vite + Tailwind in
src/). Photo pipeline lives in src/utils/image.ts (WASM libavif →
MozJPEG → canvas ladder, validation gates, never-blank), device store in
src/utils/mediaStore.ts (IndexedDB Blobs), server moments endpoints in
server/index.cjs (/api/moments, /bytes, /storage-usage), sync in
src/utils/momentsSync.ts (REST + 20s poll).

Constraints (non-negotiable):
1. Quality first: resolution drops before quality floors (WebP ≥0.58,
   AVIF ≥0.44). Any encode that fails validation falls back, never blank.
2. Every byte counted: update GET /api/storage-usage and the Timeline
   meter for any new store you add. No silent storage.
3. Delete = full wipe: server bytes + device Blob + localStorage crumbs
   (likes/saves/comments) + cached object URLs. Prove it per feature.
4. Offline-first: every remote photo keeps a device Blob (localRef) and
   renders from it when present. No feature may break airplane mode.
5. English UI strings only. Smallest diff that works; no new services
   without a free-tier cost table like Part 2 above.

Task: <PHASE-2-or-3-TASK-HERE>
```
