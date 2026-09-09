# WanderSync — Development & Deployment Log

> Step-by-step record of everything from Oracle VM creation to production deploy.
> Status: VM is created, SSH works, on-VM Docker deploy is in progress (Section 7).
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

## 7. On-VM deploy (IN PROGRESS — last completed step: SSH login)

Inside the `[opc@…]$` SSH window, serially:

```bash
# tools + Docker
sudo dnf install -y git nano
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker

# firewall: Oracle Linux blocks 80/443 by default
sudo firewall-cmd --permanent --add-service=http --add-service=https
sudo firewall-cmd --reload

# code (prod release) + env
git clone --branch prod-v1 https://github.com/progeek29/trip-finance-tracker.git
cd trip-finance-tracker/deploy
cp .env.example .env
openssl rand -hex 24
```

Put the generated password into `.env` as `POSTGRES_PASSWORD=` and set `DOMAIN=wandersync-app.duckdns.org` (`nano .env`, save with `Ctrl+O`, Enter, `Ctrl+X`):

```bash
# deploy
sudo docker compose up -d --build
sleep 20
sudo docker compose ps
curl -s http://localhost:3001/api/health
```

Success = `{"ok":true,…}` on the last line. Containers restart automatically (`restart: unless-stopped`), so a VM reboot self-heals.

---

## 8. Remaining work (not started)

1. **HTTPS check:** `https://wandersync-app.duckdns.org/api/health` in a browser (Caddy mints the Let's Encrypt cert automatically, allow 1–2 min).
2. **Vercel frontend:** import repo, root `.`, env vars `VITE_API_URL=https://wandersync-app.duckdns.org/api` and `VITE_SOCKET_URL=https://wandersync-app.duckdns.org`, deploy.
3. **APK rebuild against live URL** (kills the same-WiFi/laptop-on dependency), then share/install as before.
4. **Phase 2 hardening:** nightly `pg_dump` cron → object storage/Drive; `prod-v2` release flow rehearsal; PWA check on iPhone.
