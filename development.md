# WanderSync — Development & Deployment Log

> Step-by-step record of everything from Oracle VM creation to production deploy.
> Status: BACKEND (prod-v4) + FRONTEND LIVE — app: `https://trip-finance-tracker.vercel.app`, API: `https://wandersync-app.duckdns.org/api` (both verified 200/ok).
> Convention: commands are copy-pasteable. Nothing here is committed automatically.

---

## 0. Architecture (what we are building toward)

- **Backend + DB on one Oracle Always-Free VM** (Ampere A1.Flex, 2 OCPU / 12 GB, Mumbai region)
  - Docker services (`deploy/docker-compose.yml`): `api` (Node + Socket.io, port 3001) + `postgres:15-alpine` + `caddy:2-alpine` (auto-HTTPS on 80/443)
  - Postgres schema auto-creates on first boot from `supabase/schema.sql`; data persists in the `pgdata` Docker volume
- **Public name:** `wandersync-app.duckdns.org` (DuckDNS, free) → VM public IP `140.238.254.90`
- **Frontend:** Vercel (pending) with `VITE_API_URL` / `VITE_SOCKET_URL` pointing at the DuckDNS domain
- **Android:** debug APK already built (`android/app/build/outputs/apk/debug/app-debug.apk`, 6.9 MB, LAN backend `http://192.168.1.12:3001`); will rebuild against the live URL once the backend is up
- **iOS:** backlog — PWA via Safari "Add to Home Screen" (no Mac / no $99 account needed)

---

## 1. Oracle Cloud account signup

1. Link: **https://www.oracle.com/cloud/free/** → "Start for free"
2. **Home Region: `India West (Mumbai)`** — this locks forever and free resources only exist in the home region. (Hyderabad was offered; rejected — smaller/older region = worse free capacity odds, no latency benefit.)
3. Phone OTP verification.
4. **Credit card verification gotchas (all hit in practice):**
   - Charge is **$0** — any small hold is a verification hold and auto-releases. Never click upgrade; stay on Free Tier.
   - No virtual / prepaid / single-use cards — real debit/credit with Visa/Mastercard logo only.
   - Indian debit cards: **international / e-com usage must be ON** (Oracle verifies from Ireland; OFF = instant decline).
   - Safe move: set the card's **international limit to the minimum** (₹500–1000) before verifying; turn international back OFF after activation if desired.
   - ICICI: enabling international needs the MPIN — if forgotten, iMobile Pay login screen → "Forgot MPIN?" → OTP on registered mobile → set new 4-digit MPIN.
   - Back-to-back retries trigger bank fraud blocks — wait 1–2 hours between attempts; a family member's credit card also works (hold only).
5. Account creation takes ~15 min after signup ("We are creating your account…"). Wait for the ready email, then log in to the OCI Console.
6. Confirm: Console login works, home region shows Mumbai → say "account active".

---

## 2. Networking (VCN built manually — the inline wizard flow was broken)

The in-instance-creation "create new VCN/subnet inline" flow never enabled the public-IP checkbox (empty subnet dropdown, dead toggle). Reliable path: build the network first, then attach the VM to it.

1. ☰ → **Networking → Virtual Cloud Networks → Create VCN**
   - Name: `krey-vcn`
   - If **"Start VCN Wizard"** exists, use it (VCN + public subnet + internet gateway in one click).
   - Manual form: **IPv4 CIDR Blocks = `10.0.0.0/16`** (Required field — type it, don't paste).
   - Leave IPv6 / BYOIPv6 / DNS alone → Create.
2. **Subnet:** inside `krey-vcn` → create `public-subnet`, CIDR `10.0.0.0/24`, **Security List = Default Security List for krey-vcn**.
3. **Internet Gateway:** `krey-vcn` → Resources → Internet Gateways → Create, name `igw`.
4. **Route rule:** Route Tables → Default Route Table for `krey-vcn` → Add Route Rules:
   - Destination CIDR: **`0.0.0.0/0` — TYPE BY HAND.** Pasting from chat inserts an invisible character → "invalid notation" error.
   - Target Type: Internet Gateway → Target: `igw` → Add.
5. **Ingress rules:** Security Lists → Default → Add Ingress Rules — 3 rules, all TCP, **Source Type: CIDR** (not Service), Source CIDR `0.0.0.0/0`:
   - Port **80**, port **443**, port **22** — each number goes in **Destination Port Range** (NOT Source Port Range; source stays empty), typed by hand.
   - Egress `0.0.0.0/0` allow-all already exists — leave it.

Gateway cheat-sheet (why only Internet Gateway): the VCN is a private neighborhood — Internet Gateway is the two-way main gate (server visible to the world). NAT = one-way out, Service Gateway = private path to Oracle services, LPG/DRG = VCN-to-VCN/region/VPN joins, none needed here.

---

## 3. VM creation

1. ☰ → **Compute → Instances → Create instance**
2. Name: `wandersync-server`, compartment `apurvtripathi29 (root)`, AD-1, on-demand, Oracle Linux 9 (default image).
3. **Shape → Change shape → Ampere → `VM.Standard.A1.Flex`, OCPUs: 2, Memory: 12 GB.**
   - Confirm the **"Always Free-eligible"** tag — without it, don't proceed. Never exceed 2/12 (fields allow up to 80/512, but anything above free quota bills).
   - The `$2.76` estimate shown is list price before the Always-Free discount — actual bill is $0.
4. **Networking → Select existing VCN** → `krey-vcn` → **Select existing subnet** → `public-subnet` → **public IPv4 = Yes** (must say Yes on Review, otherwise the server is unreachable).
5. **SSH keys → "Generate a key pair for me"** — the radio must show a blue dot (nothing selected = `0 of 4` tasks, Create stays disabled). **Download private + public key.** The private key is shown once — losing it means replacing keys later.
6. Storage: defaults (boot volume ~47 GB, inside the 200 GB free allowance).
7. Review → Create. 2–5 min to **Running** (green). Result: **Public IP `140.238.254.90`**, SSH user **`opc`**.

---

## 4. SSH from Windows (the key-permission saga — exact fix)

Key files: `C:\Imp Work\First Server\ssh-key-2026-09-09.key` (private, no extension) + `.pub` (public, safe to share anywhere).

Errors hit, in order:
1. `WARNING: UNPROTECTED PRIVATE KEY FILE … BUILTIN\Users … bad permissions` → SSH refuses the key.
2. `takeown` → Access denied; `icacls /inheritance:r /grant` appeared to succeed (`Apurv:(R)`) but **`Copy-Item` still → Access denied** — in both the user's shell and automation.
3. Root cause: `/inheritance:r` stripped SYSTEM/Administrators and the grant with unqualified `$env:USERNAME` resolved to the wrong principal — Read displayed, but effective access was none (user SID ends `…-1001`; file ACE didn't match the token).

Fix that worked (run in the `C:\Imp Work\First Server` PowerShell):

```powershell
icacls .\ssh-key-2026-09-09.key /reset
New-Item -ItemType Directory -Force $env:USERPROFILE\.ssh
Copy-Item .\ssh-key-2026-09-09.key $env:USERPROFILE\.ssh\wandersync.key
icacls $env:USERPROFILE\.ssh\wandersync.key /inheritance:r /grant:r "*S-1-5-21-3313038825-3452150113-2346736375-1001:R"
icacls $env:USERPROFILE\.ssh\wandersync.key
```

Login (every time — save this one line, no icacls needed again):

```powershell
ssh -i $env:USERPROFILE\.ssh\wandersync.key opc@140.238.254.90
```

First time: type `yes` at the fingerprint prompt. Success looks like: `[opc@wandersync-server ~]$` — that prompt means "you are inside the VM"; all Section 7 commands run there, not on the laptop.

---

## 5. Public DNS (DuckDNS, free)

1. **duckdns.org** → login (GitHub/Google) → subdomain box: `wandersync-app` → Add Domain.
2. In the domain row, set current IP to the VM public IP (`140.238.254.90`) → update/save.
3. Result: `wandersync-app.duckdns.org` → VM. (Pressing update twice is harmless.)
4. Note: this name serves the **backend API** (`…/api/health` returns JSON), not the app UI — the UI comes via Vercel in Section 8.

---

## 6. Release process (prod tags — treat the server as prod from day one)

- `git tag -a prod-v1 -m "Production release v1: deployment-ready backend, Oracle stack"` → pushed. The VM clones `--branch prod-v1`.
- Future changes ship as `prod-v2`, `prod-v3`… (pull + rebuild on the VM per release).
- Untouched safety nets: branches `stable/system-all-working`, `dev/working-copy`; tag `stable-v1`.

---

## 7. On-VM deploy (DONE — executed by agent over non-interactive SSH on user's behalf)

All commands below ran from the laptop via `ssh -i ~/.ssh/wandersync.key -o BatchMode=yes opc@140.238.254.90` (same user, key already fixed in Section 4). No manual VM typing needed.

```bash
# tools (git/nano via dnf; Docker CANNOT come from get.docker.com on Oracle Linux —
# it aborts with "ERROR: Unsupported distribution 'ol'". Use Docker's CentOS repo:)
sudo dnf install -y git nano dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
docker --version  # 29.8.0, compose v5.5.1

# firewall: Oracle Linux blocks 80/443 by default
sudo firewall-cmd --permanent --add-service=http --add-service=https
sudo firewall-cmd --reload  # services now: dhcpv6-client http https ssh

# code (prod release) + env — password is generated ON the VM and never leaves it:
git clone --branch prod-v1 https://github.com/progeek29/trip-finance-tracker.git
cd trip-finance-tracker/deploy
PW=$(openssl rand -hex 24)
echo "DOMAIN=wandersync-app.duckdns.org" > .env
echo "POSTGRES_PASSWORD=$PW" >> .env
# .env now has exactly 2 lines. It is NOT in git (only .env.example is tracked;
# .gitignore also has a .env rule) and was never displayed unmasked anywhere.

# deploy
sudo docker compose up -d --build
sleep 20
sudo docker compose ps  # api + postgres + caddy, all Up
```

Health check that works (read this before debugging): the `api` service publishes NO host port,
so `curl http://localhost:3001` from the VM host correctly FAILS (connection refused).
Check from inside the container or via the public URL instead:

```bash
sudo docker compose exec -T api wget -q -O - http://localhost:3001/api/health
# → {"ok":true,…}
```

Containers restart automatically (`restart: unless-stopped`), so a VM reboot self-heals.
First boot also auto-creates all 14 tables from `supabase/schema.sql` (verified in Section 9).

---

## 8. prod-v2: the SSL bug (first deploy returned ok:false)

Symptom after first `compose up`: `{"ok":false,"error":"The server does not support SSL connections"}`.
Cause: `server/db.cjs` forced `ssl: { rejectUnauthorized: false }` on EVERY `DATABASE_URL`
(written for Neon). The on-VM Postgres has no SSL, so every DB query failed and `/api/health` reported down.
Fix (commit `d4842fc`): SSL only when the URL asks for it —

```js
const _dbUrl = process.env.DATABASE_URL || '';
const _needSSL = /sslmode=require/i.test(_dbUrl);
// …
ssl: _needSSL ? { rejectUnauthorized: false } : false,
```

(actual code in `server/db.cjs` — see file). Same commit removed the obsolete `version: "3.9"` line
from `deploy/docker-compose.yml` (compose v5 warns on it) and added the `.env` gitignore rule.
Released as `git tag -a prod-v2`, VM moved with `git fetch --tags && git checkout prod-v2 &&
sudo docker compose up -d --build api` → `{"ok":true}`.

Lesson for all future releases: every server change ships as a new `prod-vN` tag; the VM only
ever checks out tags, never branches.

---

## 9. Verification (all green, 2026-09-09)

- `sudo docker compose ps` — `deploy-api-1`, `deploy-postgres-1`, `deploy-caddy-1`, all `Up`.
- Container health — `wget http://localhost:3001/api/health` inside api → `{"ok":true,"time":"…"}`.
- Public HTTPS — `https://wandersync-app.duckdns.org/api/health` from laptop → `{"ok":true}` (Caddy minted the cert on first request, no waiting needed).
- Database — 14 app tables present: `chat_messages documents expense_events expenses invites members_joined message_reads presence push_tokens settlements signals todos trips users`.

---

## 10. ⚠️ CRITICAL — read before touching prod again

1. **SSH key is single-copy.** Oracle showed the private key ONCE. It lives at `C:\Imp Work\First Server\ssh-key-2026-09-09.key` (original) and `C:\Users\apurv\.ssh\wandersync.key` (working copy). Back it up to Drive/pen drive — lose both = locked out (key replacement via console is painful).
2. **DB password lives ONLY in `/home/opc/trip-finance-tracker/deploy/.env` on the VM.** Never in git, never on the laptop, never shown unmasked. Need it? SSH in + `cat ~/trip-finance-tracker/deploy/.env`. Changing it later requires `ALTER USER wandersync …` inside Postgres too (container was initialized with the old one) — not just editing `.env`.
3. **VM only tracks `prod-vN` tags.** Never `git pull` a branch on the server. New release = new tag → `git fetch --tags && git checkout prod-vN && sudo docker compose up -d --build`.
4. **Type `0.0.0.0/0` by hand in OCI console.** Pasted text carries an invisible character → "invalid notation".
5. **Ingress ports go in Destination Port Range**, never Source. Source Type = CIDR, Source = `0.0.0.0/0`.
6. **Never exceed 2 OCPU / 12 GB** on the shape — the form allows up to 80/512 and anything above free quota bills.
7. **`stable/system-all-working` + `stable-v1` are frozen.** All work happens on `dev/working-copy`.
8. **Windows SSH key ACL trap:** `icacls /inheritance:r` + unqualified `$env:USERNAME` grant can map to the wrong principal (Read shows, access denied anyway). Fix = `icacls file /reset`, re-copy, grant by explicit SID (`*S-…-1001:R`).

---

## 11. Remaining work (next up)

1. **Vercel frontend — DONE (verified).** (details in previous version of this section — see git history)
   Live: `https://trip-finance-tracker.vercel.app` — verified HTTP 200; backend health `ok:true`.
   URLs also stored in `README.md`.
2. **`main` is now the live branch.** `dev/working-copy` → fast-forward merged into `main` → pushed
   (`d4842fc`). Uncommitted work was stashed first, then restored onto `dev/working-copy` — nothing lost.
   Vercel Production Branch can move back to `main` whenever convenient (currently `dev/working-copy`, same code).
3. **prod-v3: vault hidden, forgot-password, admin user management (LIVE on VM).**
   - Vault button hidden (`Navbar` entry removed + `FolderOpen` import dropped; `loadSessionTab` falls back
     `vault → trip`). Data + views untouched — re-add one line to restore.
   - Forgot password is NEW (never existed): `POST /api/auth/forgot-password` verifies email + registered
     mobile (last-10-digits match, format-proof) then bcrypt-hashes the new password. Login screen has
     "Forgot password?" → reset form → back to login. No email/SMS infra needed.
   - Admin (`AdminActivity`, role `admin`): user list now comes from `GET /api/users` which EXCLUDES
     `password_hash` (previously leaked to anyone). Admin create-user now hashes server-side
     (`POST /api/admin/create-user` — previously created users could never log in). New admin
     password reset (`POST /api/admin/reset-password`) + server-side user delete with owned-trip purge
     (`POST /api/admin/delete-user`, refuses self-delete). Generic `PUT`/`POST /api/users` strips
     `password_hash` so hashes only ever enter via bcrypt paths. UI: password field in Add modal,
     reset block in Edit modal, self-delete disabled, self-demote blocked (lockout-proof).
   - Honest note: nobody can SEE a password (bcrypt is one-way) — "show password" is impossible by design;
     admin reset + user self-reset cover the forgot cases.
   - Tested 17/17 on local backend (signup → forgot ok/wrong-phone → admin create/signin → non-admin
     refused → admin reset/signin → no hash leak → self-delete refused → delete + cleanup), then shipped:
     commit `c7f7aa6`, tag `prod-v3`, VM `checkout prod-v3` + api rebuild → health `ok:true`,
     `/api/users` → `[]` (no prod users yet). Vercel auto-redeploys the frontend from the push.
4. **APK rebuild against live URL** (kills the same-WiFi/laptop-on dependency), then share/install as before.
5. **Phase 2 hardening:** nightly `pg_dump` cron → object storage/Drive; PWA check on iPhone.
