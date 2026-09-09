# Wrote CurrentUpdate_12:40AM.md
# WanderSync — Session Update
**Generated:** 12:40 AM, 10 September 2026  
**Author:** AI Agent (opencode session)  
**Project:** Trip Finance & Travel Sync (WanderSync)

---

## ⏱️ Session Context
- **Branch:** `dev/working-copy` → fast-forward merged into `main`
- **Tags created:** `prod-v1`, `prod-v2`, `prod-v3`, `prod-v4`
- **VM:** Oracle Always-Free Ampere A1.Flex (2 OCPU/12GB, Mumbai region), public IP `140.238.254.90`
- **Frontend:** Vercel `https://trip-finance-tracker.vercel.app`
- **Backend:** Docker on VM + Caddy HTTPS via DuckDNS `wandersync-app.duckdns.org`

---

## ✅ What Was Done (A-to-Z)

### 1. **Production Oracle VM Deploy**
- VM created: `wandersync-server` (always-free, 2 OCPU/12GB)
- Network: VCN `krey-vcn`, public subnet, Internet Gateway, route rules, security lists (ports 80/443/22)
- Docker stack: `deploy/docker-compose.yml` + `Caddyfile` + `.env.example`
- HTTPS auto-minted by Caddy (first request): `https://wandersync-app.duckdns.org/api/health` → `{"ok":true}`
- SSH access confirmed: `[opc@wandersync-server ~]$`

### 2. **Vercel Frontend Live**
- URL: `https://trip-finance-tracker.vercel.app` (HTTP 200, verified)
- Env vars: `VITE_API_URL=https://wandersync-app.duckdns.org/api`, `VITE_SOCKET_URL=https://wandersync-app.duckdns.org`
- Critical fix: Production Branch → `dev/working-copy` (was stuck on stale GitHub default `feature/2026-09-09`)
- `README.md` now includes simple live web, Android, and iPhone Safari instructions

### 3. **Code & Security (prod-v3 tag)**
| Feature | Status |
|---------|--------|
| **Vault button hidden** in Navbar + App tab fallback (`vault → trip` on reload) | Done |
| **Forgot-password via phone**: new endpoint `POST /api/auth/forgot-password` — verifies email + registered mobile (last-10 digits), then bcrypt-hashes new password | Done |
| **Admin user mgmt** via new endpoints: `GET /api/users` (no hash leak), `POST /api/admin/create-user` (server-side hash), `POST /api/admin/reset-password`, `POST /api/admin/delete-user` (refuses self-delete) | Done |
| **Generic `PUT`/`POST /api/:table`** now strips `password_hash` if ever sent | Done |
| **17/17 local backend tests** passed (signup → forgot OK → wrong phone → admin create/signin → non-admin refused → admin reset/signin → no hash leak → self-delete refused → cleanup) | PASS |

### 4. **Release `prod-v4` — 10 September 2026**
- Main branch updated to release commit `a8321ef` and tagged `prod-v4`.
- Forgot password is now the minimal Email + New password flow and returns users to Login after success.
- My Trips ownership control is now a smooth `All / Owner / Joined` sliding selector with indigo active styling.
- My Trips spacing was cleaned up without changing the existing color theme.
- Web PWA metadata and manifest were added for Safari Add to Home Screen.
- Android version is `1.2` / version code `3`; live-backend debug APK built at `android/app/build/outputs/apk/debug/app-debug.apk`.
- Next MVP now includes featured packages such as Ladakh `10D / 9N`, package details, booking, payments, and admin inventory.

### 3. **Git State**
- `main` branch: fast-forward merged from `dev/working-copy`, pushed to remote
- Tags: `prod-v1` (initial compose), `prod-v2` (PG SSL fix), `prod-v3` (vault hidden + forgot + admin mgmt)
- Uncommitted work (README, development.md, android gradle tweaks) safe on `dev/working-copy`

### 4. **Verification (all green)**
| Item | Result |
|------|--------|
| `https://trip-finance-tracker.vercel.app` | 200 OK |
| `https://wandersync-app.duckdns.org/api/health` | `{"ok":true}` |
| `https://wandersync-app.duckdns.org/api/users` | `[]` (no prod users yet) |
| VM Docker services (api + postgres + caddy) | All `Up` |
| SSH into VM | `yes → [opc@…]$` |
| 17/17 auth/admin tests | PASS |

---

## 📋 Next Steps (optional)

1. **APK rebuild against live URL** (kills same-WiFi/laptop dependency):
   ```powershell
   $env:VITE_API_URL = "https://wandersync-app.duckdns.org/api"
   $env:VITE_SOCKET_URL = "https://wandersync-app.duckdns.org"
   npm run build
   .\gradlew.bat assembleDebug --no-daemon -q
   # Share android/app/build/outputs/apk/debug/app-debug.apK via USB/Drive
   ```

2. **Phase 2 hardening** (optional):
   - Nightly `pg_dump` cron → Drive/Storage
   - PWA check on iPhone (Safari → Share → "Add to Home Screen")

3. **Restore Vault button** (if needed):
   - Edit `src/components/common/Navbar.tsx`: add back `{ id: 'vault' as CleanTab, label: 'Vault', icon: FolderOpen },` plus `FolderOpen` import
   - Edit `src/App.tsx`: guard `loadSessionTab` to not auto-fallback `vault → trip`

---

## Session complete
All core deployment (VM + HTTPS + frontend) is live and functional.  
Uncommitted changes preserved on `dev/working-copy`. Tags `prod-v1`/`prod-v2`/`prod-v3` mark release milestones.

*Generated from opencode session — no human manual steps required beyond what's listed above.*