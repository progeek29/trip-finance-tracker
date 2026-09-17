# WanderSync Master Roadmap — discussed + decided (16 Sep 2026)

> Single source of truth. Nothing here should live only in chat memory.
> Repo: `trip-finance-tracker` · branch `fix/chat-coming-soon` · Vercel prod branch: `dev/working-copy`

---

## 1. DONE (verified from git history + live proof)

| # | Work | State | Proof |
|---|---|---|---|
| 1 | Chat tab hidden (temp, code intact) | ✅ Live (Vercel) | `44f78a0` |
| 2 | Timeline composer NEW PAGE (+ FAB, Home-first bar, counts K/M, share plane, send icon, fixed 4:5 feed, caption-after-actions, Home→landing) | ✅ Branch `dc47fbd`, Vercel push pending | build clean |
| 3 | Crop: bounded 0.8–1.91, EXIF normalize, 1080 lock, ~59KB AVIF | ✅ `dc47fbd` | meter `~59KB · avif` |
| 4 | Dandelion like (mock geometry, burst, red, plain count) | ✅ `dc47fbd` | build clean |
| 5 | P1 identity: auto `@handle` + gender + unique index | Backend ✅ live (`prod-v36`, 11/11 backfilled) · Frontend ⏳ local-verify | `idx_users_username_lower` |
| 6 | **SECURITY**: users-table lockdown + admin session-gate + forgot-password OFF + users self-only directory | ✅ Live (`prod-v37`+`prod-v38`), **attack-proved** (escalation blocked, 503, 401) | live test log in chat |
| 7 | pgAdmin SSH tunnel (loopback-only 5432, `prod-v34`) | ✅ Live | `TUNNEL-OK` |
| 8 | VACUUM on delete + one-time FULL cleanup | ✅ Live (`prod-v33`) | DB 9.7→8.1MB local |
| 9 | `PHOTO_STORAGE_PLAN.md` (capacity math + migration trigger) | ✅ Committed | repo root |
| 10 | Local admin created (`admin@wandersync.com` / `123456`, LAPTOP DB ONLY — weak, change later) | ✅ Local | verified login |

**Skew warning (16 Sep):** backend live = `prod-v38`, frontend live (Vercel) = `dc47fbd`.
`e322223` + `c66d93c` + `19e44c9` + `3b8f2b7` not yet pushed to `dev/working-copy`.
Push after P1 Profile UI local verify.

---

## 2. LOCKED MODULE ORDER (no more jumping — one by one)

1. ✅ Security — DONE
2. **Admin master-key — NEXT** (role + session-gated endpoints + panel exist; **impersonation** pending: admin logs in AS any user for debug)
3. **Chat request-system** (P2/P3 — design locked §4)
4. **Discover landing before My Trips** (design locked §5)
5. Google sign-on — LAST (design locked §6)

---

## 3. ADMIN MASTER-KEY (next module — spec)

- Exists: `role` column, `requireAdminSession`, AdminActivity (users/trips/add/edit/delete/reset-password), `GET /api/users` (admin sees all).
- TODO: **impersonation** — `POST /api/admin/impersonate {userId}` → returns that user's session token (admin-only, audit-logged). Frontend: "Login as" button per user row + banner "viewing as X, back to admin".
- TODO: full data views (per-user trips/expenses/photos read-only).
- Recovery: password resets ONLY via admin panel until OTP module (§7).

---

## 4. CHAT REQUEST-SYSTEM (design locked — build in P2/P3)

- **Rule: no accept = zero messages** (no text/photo/call). Silent decline (sender sees nothing).
- **Identity:** auto `@handle` (`firstname≤8_xxxx`, permanent, server-unique) + 5–6 letter code (later) + QR (P2: display, scan needs camera plugin). cardNo stays internal. **NO email search ever** (enumeration risk — rejected).
- **Search results:** avatar + name + gender icon + username → public profile → Request. Phone/email never shown.
- **Gender:** field added NOW (`male|female|other|unspecified`, Profile chips, optional-but-nudged). Existing users → `not_set` + one-time prompt.
- **Safety Day-1:** block/report, 10 requests/day, search throttle, 7-day request expiry.
- **Reuse:** hidden chat rooms/ChatView code unhides on accept (~zero new chat code).
- **Phasing:** P1 identity ✅ → P2 profile+search+QR → P3 requests/bell/push/block/rooms.

---

## 5. DISCOVER LANDING before My Trips (design locked — build P1 skeleton)

- Bottom bar: **Home(Discover feed) · Trips · + · Timeline · Expenses**. App opens on Discover.
- Feed mix (rotating): editorial timelines (Must-Visit India etc.) · city cards (photo+rating+season) · packages (affiliate deep-links, commission Day 1) · user blogs · nearby events.
- **Free APIs only:** OpenTripMap+OSM (places — NOT Google Places, bills at scale), Unsplash/Pexels (photos), Open-Meteo (weather, free), Wikivoyage (itinerary text), own backend (blogs/events).
- Revenue path: P1 curated static → P2 APIs+search → P3 blogs+affiliate (first income) → P4 SEO routes (`/discover/manali`) + ads.
- Web-search APIs (SearXNG/DDG-scrape/NewsAPI/Serper) **rejected**: wrong problem (we need PLACES+COTENT, not web search), ToS/license risks. Note only.

---

## 6. GOOGLE SIGN-ON (LAST — design locked)

- Username pipeline unchanged (server mints from Google name+uid). Gender never from Google (unreliable scope) — always in-app.
- Password-signup: NO gender (friction) → Profile nudge.
- Google flow: OAuth → verify → find-or-create → **phone-collection screen** (+optional gender chips, free ride, Skip allowed).
- Needs: `google-auth-library` endpoint, `google_sub` column, web GIS button + Capacitor plugin, testing. AFTER P2.

---

## 7. PASSWORD RESET — OTP MODULE (queued after Admin)

- `POST /api/auth/forgot-password` is **503-OFF by design** (was zero-verification takeover hole). Do NOT re-enable without OTP.
- Interim: admin panel reset (session-verified).
- Real fix: phone-OTP (MSG91/2Factor-style Indian provider) — phones already verified per user. Own module, own tag.

---

## 8. PHOTO STORAGE (see `PHOTO_STORAGE_PLAN.md` — summary)

- Today: bytes in PG `photos.data` (~60KB AVIF). Comfortable to ~50k photos.
- Trigger at 1–2GB (~15–30k): migrate bytes → **Supabase Storage 1GB** (rows keep URL, frontend untouched), then R2.
- Supabase 1GB ≈ 17k photos — that number is about the free tier, NOT our system (VM disk ~19GB free). Never confuse again.

---

## 9. PRODUCTION FLOW (how we ship — same every time)

- Frontend live: push to `dev/working-copy` → Vercel auto-deploys. Verify build first.
- Backend live: commit → tag `prod-vN` → VM: `git fetch --tags && git checkout prod-vN` → `docker compose up -d --build` → health check. **Migrate FIRST when schema changes** (`node migrate.cjs` before checkout if old code must survive, else right after rebuild).
- VM NEVER tracks branches (tags only). `.env` + Firebase key live ONLY on VM.
- Next tag number: `prod-v39` (last used: `prod-v38`).

## 10. ACCESS CHEAT-SHEET (no secrets here — locations only)

- Vercel dashboard, Oracle console, DuckDNS: see `PLATFORM_LOGINS.md`.
- VM SSH: `ssh -i $env:USERPROFILE\.ssh\wandersync.key opc@140.238.254.90` (key: `C:\Users\apurv\.ssh\wandersync.key` + original backup).
- DB password: ONLY in `/home/opc/trip-finance-tracker/deploy/.env` on VM.
- pgAdmin live: SSH tunnel `ssh -i ... -N -L 5433:localhost:5432 opc@...` → pgAdmin `localhost:5433` (password from VM `.env`).
- Local dev: frontend `:5173` (`npm run dev`), backend `:3001` (`npm run server`), windows must stay open.
- Local admin (LAPTOP DB only): `admin@wandersync.com` / `123456` (weak — change after OTP module). Live VM admin is SEPARATE.
