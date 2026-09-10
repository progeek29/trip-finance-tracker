# Platform Logins — WanderSync

One place for all login links. App users need only the first link. The rest are for admin/owner maintenance.

## App (for everyone)

- **WanderSync Login:** https://trip-finance-tracker.vercel.app/
- **Backend health (technical check only):** https://wandersync-app.duckdns.org/api/health

## Admin / Owner logins

| Platform | Login URL | What it's for | Project details |
|----------|-----------|---------------|-----------------|
| **Vercel** | https://vercel.com/login | Frontend hosting, env vars (`VITE_API_URL`, `VITE_SOCKET_URL`), production branch, redeploys | Project: `trip-finance-tracker` — Live: https://trip-finance-tracker.vercel.app — Dashboard: https://vercel.com/dashboard |
| **Oracle Cloud** | https://cloud.oracle.com | VM hosting the backend (Docker: api + postgres + Caddy) | Instance: `wandersync-server` (Ampere A1.Flex, Mumbai region) — Public IP: `140.238.254.90` — Console: https://cloud.oracle.com/cloud-console |
| **DuckDNS** | https://www.duckdns.org/ | Free DNS for HTTPS backend (points to Oracle VM IP) | Domain: `wandersync-app.duckdns.org` → `140.238.254.90` — Update token is in DuckDNS account |

## Quick notes

- Users should always use the **WanderSync Login** link above, never the backend health URL.
- If backend shows unhealthy, check in this order: DuckDNS IP → Oracle VM running → Vercel env vars.

## VM SSH login (from your laptop)

Private key is **NOT in git** (by design). It lives only on your laptop:

- Original: `C:\Imp Work\First Server\ssh-key-2026-09-09.key`
- Working copy: `C:\Users\apurv\.ssh\wandersync.key` (use this one)

Login command (PowerShell):

```powershell
ssh -i $env:USERPROFILE\.ssh\wandersync.key opc@140.238.254.90
```

First time type `yes` at fingerprint prompt. Success = `[opc@wandersync-server ~]$` prompt.

Full key-permission fix + deploy history: see `development.md` Section 4 and Section 10.
