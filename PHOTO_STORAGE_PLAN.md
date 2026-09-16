# Photo Storage Plan — WanderSync Timeline Moments

> Decided with Apoorv, 16 Sep 2026. Principle: **design once — no revisit at crash time.**

## Where bytes live TODAY
- Moment photo bytes → Postgres `photos.data` (bytea) on our own backend
  (local laptop PG for dev, Oracle VM PG for live) + phone IndexedDB copy.
- Postgres row keeps metadata + URL (`/api/moments/:id/bytes`).
- Supabase cloud is used for **nothing** (no DB, no Storage, no Auth) — its
  1GB free Storage is irrelevant until the migration below.

## Honest capacity math (avg 60KB/photo, current pipeline)
| Photos | Bytes | Verdict (bytes-in-Postgres design) |
|---|---|---|
| 1,000 | ~60MB | aaraam |
| 10,000 | ~600MB | chalega |
| 50,000 | ~3GB | dard shuru (GBs pg_dump backups, heavy VACUUM, slow queries) |
| 1,00,000 | ~6GB | mat karo |
| 3,00,000 | ~18GB | VM disk (~19GB free) khatm ke kareeb |

- Supabase free 1GB fits only ~17k photos — that number is about the free
  tier, NOT about our system. Do not confuse the two.
- Postgres never "crashes" on full disk — writes fail with rollback (no data
  loss). Disk monitoring is in RUNBOOK §5B. Still, we migrate BEFORE pain.

## Decision: one-time migration to object storage
**Trigger: when `photos` live bytes cross 1–2GB (~15–30k photos). NOT now
(currently ~135KB).**

- **Target: Supabase Storage bucket (1GB free ≈ 17k photos headroom).**
  - RLS: private bucket, access via backend-signed URLs (no public list).
  - Pause risk (free project sleeps after 7d idle) → mitigated by weekly
    cron ping from the VM (next to the backup cron in RUNBOOK §5B).
  - Egress cap 5GB/month ≈ 85k photo views — fine until real scale.
- **After Supabase fills: Cloudflare R2** (10GB free, zero egress fee).
  Same design, only the backend storage driver swaps.
- **Design (backend-only, frontend untouched):**
  - `POST /api/moments` writes bytes to bucket, row keeps `storagePath` + URL.
  - `GET /api/moments/:id/bytes` serves from bucket (legacy `data` column
    as fallback until backfilled).
  - One-time backfill script moves existing bytea rows → bucket, then
    `UPDATE photos SET data = NULL`.
  - `pg_dump` stays tiny forever; same `/moments` + `/bytes` API contract.
- **Rejected:** VM-disk files (ties data to one box, backup complexity back),
  backend Sharp 25KB pass (visible quality loss at 1080px — documented).

## Done already (prod-v33, live on VM)
- `DELETE /api/moments/:id` runs `VACUUM photos` right after the tombstone —
  the DB-size meter drops on delete instead of going stale.
- One-time `VACUUM FULL photos` cleanup done (local + VM).
- `photos` table created on live VM via `node migrate.cjs` (it never existed
  there — Timeline posting on live was silently broken before this).
- VM Postgres reachable from laptop ONLY via SSH tunnel
  (`ssh -L 5433:localhost:5432`); public 5432 closed (was brute-force bait).
  Compose binds `127.0.0.1:5432` — see `deploy/docker-compose.yml` + comment.

## pgAdmin live access (tunnel)
1. `ssh -i $env:USERPROFILE\.ssh\wandersync.key -N -L 5433:localhost:5432 opc@140.238.254.90` (keep window open)
2. pgAdmin → Add Server: Host `localhost`, Port `5433`, DB `wandersync`,
   User `wandersync`, password = `POSTGRES_PASSWORD` from VM `deploy/.env`.
