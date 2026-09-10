# WanderSync — Master Runbook (save this file separately)

> One file = full project brain. App login, infra logins, stack, setup map,
> daily commands, DB access, Docker, VM health + DB space + logs,
> release flow, backup, troubleshooting, and presentation-ready pitch.
> Copy-pasteable on Windows PowerShell unless marked `VM`.

---

## 1. Open / Login links (one place)

| Use | URL |
|-----|-----|
| **App login (users)** | https://trip-finance-tracker.vercel.app/ |
| **Backend health (technical)** | https://wandersync-app.duckdns.org/api/health → `{"ok":true}` |
| **Vercel login (owner)** | https://vercel.com/login — project `trip-finance-tracker`, dashboard https://vercel.com/dashboard |
| **Oracle Cloud login (owner)** | https://cloud.oracle.com — instance `wandersync-server`, Mumbai region, IP `140.238.254.90`, console https://cloud.oracle.com/cloud-console |
| **DuckDNS login (owner)** | https://www.duckdns.org/ — domain `wandersync-app.duckdns.org` → `140.238.254.90` |
| **GitHub repo** | https://github.com/progeek29/trip-finance-tracker |

### VM SSH (from your laptop, PowerShell)

Private key is NOT in git. Locations on laptop:

- Original: `C:\Imp Work\First Server\ssh-key-2026-09-09.key`
- Working copy (use this): `C:\Users\apurv\.ssh\wandersync.key`

```powershell
ssh -i $env:USERPROFILE\.ssh\wandersync.key opc@140.238.254.90
# first time type: yes → success prompt: [opc@wandersync-server ~]$
```

BACKUP the `.key` file to Drive/pen-drive. Lose it = locked out.

---

## 2. Stack we use (exact)

| Layer | Tech | Notes |
|-------|------|-------|
| Frontend | React 19 + Vite 6 + TypeScript ~6.0 + Tailwind v4 | `src/`, build → `dist/`, SPA rewrite in `vercel.json` |
| UI extras | Recharts, Lucide icons, Canvas-confetti, idb (IndexedDB offline) | Photos/tickets offline-first via `MediaImg` + `storageProvider` |
| Backend | Node + Express 5 + Socket.io 4 (`server/index.cjs`, `db.cjs`) | Port 3001 inside Docker, no host port |
| Auth hashing | bcryptjs (server-side only) | No `password_hash` ever leaves API |
| DB | Postgres 15-alpine, DB `wandersync`, user `wandersync` | 14 tables, auto-created from `supabase/schema.sql` on first boot |
| Realtime | Socket.io rooms `trip:<id>` (chat, typing, presence, bell/siren) | Same Express server |
| Closed-app voice | FCM data + `VoiceFirebaseService` + `VoicePlaybackService` (mediaPlayback FGS) | Server clip store memory-only 5-min TTL; FCM offline-only; transmit stays foreground |
| Hosting FE | Vercel, project `trip-finance-tracker` | Env: `VITE_API_URL=https://wandersync-app.duckdns.org/api`, `VITE_SOCKET_URL=https://wandersync-app.duckdns.org` |
| Hosting BE | Oracle Always-Free Ampere A1.Flex (2 OCPU/12GB, Mumbai) | Docker: `api` + `postgres` + `caddy`, `restart: unless-stopped` |
| HTTPS/DNS | Caddy 2-alpine (auto Let's Encrypt) + DuckDNS | `deploy/Caddyfile` reverse-proxies `api:3001`, domain from `.env` |
| Mobile | Capacitor 6 (`com.wandersync.tripapp`, `webDir: dist`), Android 1.2 / code 3 | APK: `android/app/build/outputs/apk/debug/app-debug.apk` |
| iPhone | Safari PWA (Add to Home Screen) | No native build yet (needs macOS/Xcode) |
| Lint | oxlint | `npm run lint` |

DB tables (14): `users, trips, members_joined, invites, expenses, settlements, expense_events, todos, documents, chat_messages, message_reads, presence, push_tokens, signals`.

---

## 3. Setup map — kya kaha setup hai

```
Laptop (Windows)                    Oracle VM (140.238.254.90)              Vercel / Internet
─────────────────                   ──────────────────────────              ─────────────────
src/ → npm run build → dist/  ────► Vercel serves dist/ (SPA)
server/ (index.cjs, db.cjs)   ────► VM: ~/trip-finance-tracker (tag checkout)
supabase/schema.sql           ────► VM postgres first-boot init
deploy/docker-compose.yml     ────► VM: api + postgres + caddy
deploy/Caddyfile + .env       ────► VM only (.env NEVER in git)
~/secrets/firebase-service-account.json (VM only, 600) ──► FCM send
DuckDNS domain                ────► points to VM IP, Caddy mints cert
Vercel env vars               ────► point app to DuckDNS API
APK (android/)                ────► built from dist/ WITH live env vars, talks to live API
```

- `.env` lives ONLY at `/home/opc/trip-finance-tracker/deploy/.env` on VM (DOMAIN, POSTGRES_PASSWORD, FIREBASE_SERVICE_ACCOUNT_FILE). See it via SSH + `cat ~/trip-finance-tracker/deploy/.env`.
- VM only tracks `prod-vN` tags, never branches.
- Branches: work on `dev/working-copy`, frozen safety: `stable/system-all-working`, `stable-v1`.
- APK builds MUST set `$env:VITE_API_URL` + `$env:VITE_SOCKET_URL` first — without them the APK talks to phone-localhost and login dies.

---

## 4. Daily commands (copy-paste)

### Laptop — frontend dev
```powershell
npm run dev -- --host 0.0.0.0 --port 5173   # LAN test, phone via same Wi-Fi
npm run build                                # outputs dist/
npm run lint
```

### Laptop — local backend (testing before prod)
```powershell
npm run server                               # node server/index.cjs (needs DATABASE_URL)
```

### Laptop — git (har push pe yehi flow)
```powershell
git status -sb
git diff --stat
git add <files>
git commit -m "feat: <what changed>"
git push origin dev/working-copy
```

### Release to prod (new version = new tag, har bar)
```powershell
git tag -a prod-v8 -m "Production release v8: <note>"
git push origin prod-v8
# then on VM (see Section 5):
# git fetch --tags && git checkout prod-v8 && sudo docker compose up -d --build
```

Check tags with `git tag --list`.

### APK rebuild against LIVE backend (same-WiFi dependency khatm)
```powershell
$env:VITE_API_URL = "https://wandersync-app.duckdns.org/api"
$env:VITE_SOCKET_URL = "https://wandersync-app.duckdns.org"
npm run build
npx cap sync android
# verify live URL baked in:
Select-String -Path dist/assets/index-*.js -Pattern 'wandersync-app.duckdns.org'
# Option A (no Android Studio): cd android; .\gradlew.bat assembleDebug --no-daemon -q
# Option B: npx cap open android → Build → Build APK(s)
# Output: android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 5. VM / Docker commands (run AFTER ssh login)

```bash
cd ~/trip-finance-tracker/deploy
sudo docker compose ps                        # api + postgres + caddy must be Up
sudo docker compose up -d --build             # rebuild + restart stack
sudo docker compose up -d --build api         # rebuild only api (fast, most common)
sudo docker compose exec -T api wget -q -O - http://localhost:3001/api/health
# → {"ok":true} (host curl to :3001 FAILS by design — no host port, check inside container or public URL)
```

### Deploy new release on VM (standard)
```bash
cd ~/trip-finance-tracker
git fetch --tags
git checkout prod-v8                          # new tag name here
cd deploy
sudo docker compose up -d --build
curl -s https://wandersync-app.duckdns.org/api/health
```

---

## 5B. VM health + DB space + logs (as a developer ye sab pata hona chahiye)

### A) VM health — 30-sec check (har hafte ya error par)
```bash
uptime                                        # load average, up since reboot
free -h                                       # RAM: 12GB total, available kitna bacha
df -h /                                       # disk: boot volume ~47GB, Use% < 75% rakho
df -i /                                       # inodes (100% full = files banenge hi nahi)
top -bn1 | head -20                           # CPU hog kaun hai (q to exit in live top)
systemctl is-active docker                    # must: active
sudo firewall-cmd --list-all                  # must: http https ssh open
sudo docker compose ps                        # 3/3 Up hona chahiye
curl -s https://wandersync-app.duckdns.org/api/health   # {"ok":true}
```

### B) DB space — kitna bhara hai
```bash
cd ~/trip-finance-tracker/deploy
# full DB size (one number):
sudo docker compose exec -T postgres psql -U wandersync -d wandersync -c "SELECT pg_size_pretty(pg_database_size('wandersync'));"
# top-10 heavy tables:
sudo docker compose exec -T postgres psql -U wandersync -d wandersync -c "SELECT relname AS table, pg_size_pretty(pg_total_relation_size(relid)) AS size FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;"
# row counts (sab tables):
sudo docker compose exec -T postgres psql -U wandersync -d wandersync -c "SELECT 'users' t, COUNT(*) FROM users UNION ALL SELECT 'trips', COUNT(*) FROM trips UNION ALL SELECT 'expenses', COUNT(*) FROM expenses UNION ALL SELECT 'chat_messages', COUNT(*) FROM chat_messages UNION ALL SELECT 'documents', COUNT(*) FROM documents;"
# Docker volumes + disk hog:
sudo docker system df                         # volumes/images kitna kha rahe
sudo du -sh /var/lib/docker/volumes/* 2>/dev/null | sort -rh | head
```

### C) Logs — error kaha dekhe (order me dekho)
```bash
cd ~/trip-finance-tracker/deploy
# 1. API errors (sabse pehle yehi):
sudo docker compose logs --tail=200 api | grep -iE "error|exception|fail|crash|FATAL" | tail -50
sudo docker compose logs -f api               # live follow (Ctrl+C to exit)
sudo docker compose logs --since=1h api       # last 1 hour only
# voice FCM lines look like: "voice FCM: 2/3 offline (trip <id>)"
# "voice FCM skipped: set FIREBASE_SERVICE_ACCOUNT..." = key path galat
# 2. Postgres errors:
sudo docker compose logs --tail=200 postgres | grep -iE "error|fatal|panic|no space|disk full" | tail -50
# 3. Caddy / HTTPS errors (cert, reverse-proxy):
sudo docker compose logs --tail=100 caddy
# 4. Host-level (docker daemon, OOM kills, reboot):
sudo journalctl -u docker --since "2 hours ago" --no-pager | tail -50
dmesg | grep -iE "oom|killed|error" | tail -20
journalctl --list-boots | tail -5             # kab reboot hua
# 5. Restart loop pakadna:
sudo docker compose ps                        # Restarting (x) dikhe = crash loop
sudo docker inspect deploy-api-1 --format='{{.RestartCount}} {{.State.Status}}'
```

Frontend (Vercel) logs laptop se: Vercel dashboard → project → Deployments → Latest → Runtime Logs. Browser errors: F12 Console.

### D) Developer must-knows (VM bachane wale rules)
```bash
# disk cleanup — SAFE (images/volumes kabhi -v ke sath mat udana):
sudo docker image prune -f                    # unused images only
sudo docker builder prune -f                  # build cache only
# DANGER — kabhi mat chalana (pgdata = pura DB ud jayega):
# sudo docker compose down -v
# sudo docker volume rm ...

# auto-heal check (reboot ke baad khud uthe?):
sudo systemctl is-enabled docker              # must: enabled
# containers me restart: unless-stopped hai (compose file me) — reboot self-heals

# backup cron (ek bar lagao, roz auto-backup):
(crontab -l 2>/dev/null; echo "0 3 * * * cd /home/opc/trip-finance-tracker/deploy && sudo /usr/bin/docker compose exec -T postgres pg_dump -U wandersync wandersync > /home/opc/backup-\$(date +\%F).sql && find /home/opc/backup-*.sql -mtime +7 -delete") | crontab -
# → roz 3AM backup, 7 din se purane auto-delete

# OS patch (mahine me ek bar, pehle backup lo):
sudo dnf check-update
sudo dnf update -y && sudo reboot
# reboot ke baad: ssh wapas → docker compose ps → health curl

# cert renewal: Caddy auto-renews Let's Encrypt — kuch karna nahi, bas 80/443 firewall me open rakho
# time check (DB timestamps galat lage to): timedatectl
```

NEVER list (VM par ye mat karna): branch `git pull` (sirf `prod-vN` tag checkout) · `.env` git me commit · Firebase key git me commit (`~/secrets/`, 600) · port 3001 host par expose · 2 OCPU/12GB se upar shape · `down -v` / volume delete · DB password sirf `.env` me badalna (Postgres `ALTER USER` bhi chahiye).

---

## 6. DB access (important)

Password SSH ke andar hi milega, laptop/git me kabhi nahi:

```bash
cat ~/trip-finance-tracker/deploy/.env        # shows POSTGRES_PASSWORD (VM only)
```

Postgres shell (inside container):
```bash
cd ~/trip-finance-tracker/deploy
sudo docker compose exec postgres psql -U wandersync -d wandersync
# inside psql:
\dt                        # list 14 tables
\d users                   # table schema
SELECT id, email FROM users LIMIT 5;          # safe query (never SELECT password_hash casually)
SELECT COUNT(*) FROM trips;
\q
```

One-liner queries without entering psql:
```bash
sudo docker compose exec -T postgres psql -U wandersync -d wandersync -c "SELECT COUNT(*) FROM trips;"
sudo docker compose exec -T postgres psql -U wandersync -d wandersync -c "SELECT id, email FROM users LIMIT 5;"
```

### Backup (before any risky change)
```bash
sudo docker compose exec -T postgres pg_dump -U wandersync wandersync > ~/backup-$(date +%F).sql
ls -lh ~/backup-*.sql
```

### Restore (careful — overwrites)
```bash
cat ~/backup-2026-09-10.sql | sudo docker compose exec -T postgres psql -U wandersync -d wandersync
```

> Password change = 2 steps: `ALTER USER wandersync WITH PASSWORD 'new'` inside Postgres + update `.env`, else container restart breaks (volume was init'd with old PW).

---

## 7. Health checklist (2-min verify)

```powershell
# from laptop:
curl https://trip-finance-tracker.vercel.app/          # expect 200
curl https://wandersync-app.duckdns.org/api/health     # expect {"ok":true}
```
```bash
# on VM:
sudo docker compose ps   # 3 services Up
```

If red: order = DuckDNS IP correct? → VM running? → `docker compose ps` Up? → Vercel env vars point to DuckDNS? → `logs api`.

---

## 8. Troubleshooting (common hits)

| Symptom | Cause → Fix |
|---------|-------------|
| `UNPROTECTED PRIVATE KEY FILE` | Windows ACL → `icacls file /reset`, re-copy to `~/.ssh/`, grant by SID (see `development.md` §4) |
| API `{"ok":false, SSL not supported}` | Old code forced SSL → fixed in `d4842fc`; deploy latest `prod-vN` |
| `curl localhost:3001` fails on VM host | By design (no host port) → check inside container or public URL |
| Vercel shows old app | Production Branch was on stale branch → set to `dev/working-copy` (or `main` when synced) |
| `013244` budget concat bug | pg NUMERIC arrives as string → fixed via type parser in `server/db.cjs` + `Number()` guards |
| Contact picker fails (desktop) | Expected — manual add fallback exists |
| APK login dead, nothing loads | Built without live env vars → rebuild WITH `$env:VITE_API_URL` + `$env:VITE_SOCKET_URL`, verify baked in |
| `voice FCM skipped` in api logs | `FIREBASE_SERVICE_ACCOUNT_FILE` path wrong/missing → fix `.env`, restart api |
| Closed-app voice silent, tap works | Clip expired (>5 min) or FCM throttled → test within 5 min, check `logs api` for `voice FCM:` line |
| Disk `Use% > 85%` / `no space` in postgres logs | `docker image prune -f`, old backups `rm ~/backup-*.sql`, `docker system df` — never `down -v` |
| Container `Restarting` loop | `docker compose logs --tail=200 api` me crash reason, `docker inspect ... RestartCount`, last tag pe rollback |

---

## 9. Presentation pack (ready-to-speak)

**30-sec:** "WanderSync is one travel app for the full journey — discover a package like Ladakh 10D/9N, book and pay securely, then plan, split expenses, chat realtime, walkie-talkie even with the app closed, and keep tickets together. Live on web, Android APK, and iPhone PWA."

**2-min flow:** Problem (splitwise + chat + tickets scattered) → Solution (My Trips All/Owner/Joined, Equal/Custom splits + Settle Up + undo, expense history, realtime chat with mentions/typing/presence/read-receipts, walkie-talkie with closed-app LOUD playback, vault) → Marketplace next (package cards → details → booking states → server-verified payments → admin inventory) → Stack (React/Vite, Node/Socket.io, Postgres, Docker+Caddy on Oracle free VM, Vercel, Capacitor, FCM offline-only fan-out) → Live demo (login → My Trips → Log Spend → Balances → chat → PTT → kill app → PTT again → health URL).

**Numbers to quote:** 14 DB tables · 3 Docker services · 17/17 auth tests passed · Android 1.2/code 3 · prod tags v1–v8 · uptime via `restart: unless-stopped` + Caddy auto-HTTPS · voice clips memory-only 5-min TTL, FCM offline-only (~zero server load).

**Demo order:** 1) Login link 2) My Trips filter 3) Create trip + squad 4) Log Spend → Balances → Settle 5) Chat + mention + bell 6) PTT open-app 7) PTT closed-app (kill A, speak from B) 8) Health endpoint.

**Non-goals to say confidently:** no live payments before server-verified flow tested · no vault restore before storage policy · no iOS native from Windows · no background-mic transmit in v1 · no filler features before core stable.

---

## 10. File index (kya kaha padha hai)

- `README.md` — user-facing open/login + phone steps
- `PLATFORM_LOGINS.md` — all login URLs + SSH line
- `RUNBOOK.md` (this file) — master copy, save separately
- `development.md` — full deploy diary (Oracle→Docker→Vercel, SSH saga)
- `CurrentUpdate_12.md` — last session snapshot (prod-v4)
- `UPDATES.md` — feature changelog (vault→chat→siren rounds)
- `MVP.md` — product vision + next marketplace scope + release gates
- `PROJECT_DOCUMENT.md` — original spec + roadmap
- `ANDROID_APK_GUIDE.md` — APK build + SMS receiver design

*Generated for owner save + presentation. Secrets stay on VM, never in this file.*
