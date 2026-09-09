# WanderSync — Updates Log (what was built/fixed)

> App: Trip Finance & Travel Sync (React 19 + Vite + TS + Tailwind v4)
> Every entry = live in app, build passing. Server: `npm run dev -- --host 0.0.0.0 --port 5173`

---

## 1. Vault — Tickets & Passes (full CRUD)
- Ticket add / edit / delete: title, category (ticket/hotel/id/visa/insurance/rental/other), PNR/Ref no., notes.
- File upload: image, PDF, boarding pass, CSV, TXT, DOC — stored offline in browser.
- **PNR copy**: tap Ref chip → copied (card + preview both).
- Uploaded file shows on the card — image thumbnail, labeled chip for other files (PDF/CSV…).
- **Direct open**: image → in-app preview; PDF/file → straight to a new tab (double popup removed).
- Preview shows only the actual file; nothing uploaded → no empty box, just an "Upload file" button.
- Edit always offers Change file + Remove file.

## 2. Stay spotlight (hotel tickets)
- Selecting category `hotel` reveals an **"About this stay"** block: write-up (name, rate, inclusions) + multiple stay photos.
- Vault card shows an **"🏨 Our Stay"** section — visible on landing so the stay is recognizable.

## 3. Places & Fares (multi-photo)
- Add / edit / delete: name, city, category, fare + cost-type, description, tip.
- **Multiple photo upload** (several at once), per-photo delete, first photo = Cover.
- Your own photo immediately replaces the default image; no selection → default stays.
- Card shows cover + thumbnail strip (+N overflow).
- Same options in edit (URL box removed — Upload only).

## 4. Shared Photos (gallery)
- Add (multi), edit (retake/change/remove/caption/location), delete.
- **Camera button** (`capture=environment`), gallery multi-upload, URL add.
- No image → **default trip image** — never a broken tile.
- **Like toggle**: tap = like (pink ♥ +1), tap again = unlike (−1, never below 0). Likes saved on phone.
- **Free share**: native share sheet on phone (WhatsApp/Instagram), link copy or file download on desktop.

## 5. Trip — Itinerary & Transit (CRUD)
- Stops: add / edit / delete (name, state, dates, budget, notes), per-stop spent live.
- Transit: full list (previously a single card) — add / edit / delete, PNR copy on every card.
- **PNR autofetch**: "🎟 Autofetch PNR from vault ticket" dropdown in the transit form — pick a ticket, PNR + title auto-fill.

## 6. Squad members (same CRUD everywhere)
- Trip Create, Edit Trip, and Trip-tab Squad modal — add / edit / delete in all three.
- New members get a **random cool profile photo** (DiceBear) automatically; ↻ shuffles it.
- Contact Picker fix (Android Chrome): correct API detection + manual add fallback.

## 7. Reminders (simple, confusion-free)
- **Ticket's 🔔 lives on the ticket**: date-time + free-text note in the ticket form; countdown on the card (`🔔 in 3 days • Sep 20, 06:15 — note`).
- **Trip countdown banner**: top of the trip as soon as you open it — "🎒 Starts in X days" / LIVE strip. Impossible to miss.
- New trips auto-create a "starts in 2 days — pack up!" reminder (Trip tab list, editable).

## 8. Splitwise (selective split)
- "Split with 4 friends" checkbox replaced with a **member picker**: full squad by default, per-member include/exclude chips, live per-head math (₹X ÷ N).
- Shared Bills list with add / edit / delete + settle + UPI QR (as before).

## 9. Bank SMS auto-logging
- Hooks-order bug fix (parser state was never reset).
- Broader parser: more debit keywords, 3 amount patterns, more banks (HDFC/SBI/ICICI/Axis/Kotak/Yes/PNB/Canara/PhonePe/Paytm/GPay/BHIM/Amazon Pay).
- **Auto-Read SMS** button: WebOTP (Android) + clipboard fallback + sample SMS test.
- Date field on expenses (inside the trip window).

## 10. Custom calendar (own UI, not native)
- `DatePicker` component: month grid (Monday start), selected = indigo, today = ring, out-of-range grey, Today/Clear.
- `withTime` for transit (hour + minute + Set).
- Same everywhere: expense date, trip/stop dates, transit datetimes.

## 11. Landing + Trip cards UX
- Trip cards: boxed "Open" removed, only a colored **>** chevron (no box).
- Initials fallback instead of broken avatars (`MemberAvatar` everywhere).
- Trip tab: **Total Spent card jumps to Expenses history**; **Squad card opens the members modal** (CRUD).

## 12. Fail-safes (the app never blanks out)
- **Image auto-resize** (1280px JPEG): 7–8MB photos used to crash on save — root fix.
- **Storage quota guard**: every save in try/catch — a message when full, never a white screen.
- **15MB cap** on non-image files (heavy PDFs stopped early with a clear message).
- **Global ErrorBoundary**: any crash → recovery screen (Retry, data safe) — no dead tabs.
- **Reload-proof navigation**: refresh returns to the same trip + tab (session restore).

## 13. Storage foundation (APK + scale ready)
- `storageProvider.ts` abstraction: local today, cloud tomorrow — UI never changes.
- **IndexedDB large store**: photos, tickets, stay/place images, trip covers — **full quality, uncompressed** — offline on phone (GBs of capacity). UI 100% identical (`MediaImg` component).
- Old data auto-migrates on boot; delete/archive also cleans blobs (no orphans).
- **Trip Storage meter** (Vault top): real store bytes + photos + files.
- **Archive Trip**: Step 1 full backup download (full-quality photos + tickets + expenses + everything), Step 2 clears media from the phone (history stays).
- Bucket plan ready: `trip_<id>/{originals,thumbs,docs}` + quota meter + rotation.

## 14. Phone testing
- Dev server `0.0.0.0:5173` (IPv4, phone reachable) + LAN verified HTTP 200.
- In-app "Test on Phone" QR → `http://192.168.1.12:5173` (same Wi-Fi; allow Node.js in the firewall if prompted).

---

## Next steps (decided order)
1. **Supabase sync** (DB + realtime + storage buckets) — text chat room comes with it.
2. **PDF page thumbnails** (pdf.js, free, on-device).
3. **APK build** (Capacitor) → share with friends on WhatsApp → Play Store ($25 one-time).
4. **Live walkie-talkie PTT — Ten-Ten style** (WebRTC, press-hold talk, with the APK; not voice notes, truly live).
5. Monthly finance tracker, iPhone PWA link.

---

## 15. Simplify round (user-friendly first)
- **Zero emoji** in buttons/labels app-wide; squad faces = simple emoji avatars (photos later); new WanderSync compass logo (Navbar + landing).
- **No Cancel buttons** in popups; single centered **Save** button everywhere (X stays for dismiss).
- **No "+" prefixes** on button text anywhere.
- **Custom dropdowns** (Who Paid, payment mode, transit type, ticket category, PNR pick) — basic native selects gone.
- **Calendar fixed grid** (42 cells) — no size jump on month change.
- **Itinerary = simple spots list** (name only, add/edit/remove, day-count from trip dates). No per-stop dates/budgets. "Cities/Stops" renamed Itinerary. Trip extend = edit trip dates.
- **Squad add collapsible**: list + "Add Member" box → click reveals manual/contact options. Contact errors now shown on screen.
- **Squad save bug fixed**: stale edit-state caused silent add failure; custom cover now actually saves the IDB pointer (was saving raw dataURL).
- **Tickets ultra-simple add**: upload screenshot/PDF + auto title → Save. Full options (category/PNR/reminder/stay/notes) only in Edit.
- **Places ultra-simple**: photo + name + description + optional price. City/category/cost-type/tips removed.
- **Zoom viewer** (Lightbox): ticket + place images tap-to-open with zoom/pan/prev-next.
- **Shared Photos tab = Coming Soon** (scratch rebuild later; data untouched).
- **Expenses**: download icon → full-history **PDF** (print statement); "Add Spend" single plus; filter pills + category badges text-only.
- **SMS tab**: "Enable SMS Access" allow-flow, clipboard link removed, plain messages. True background auto-read = APK native receiver (planned).
- **Navbar**: Test-on-Phone button removed.
- Todo list deliberately skipped (filler features = no usage).

---

## 18. Profile-at-login removed + phone + English-only round
- Blocking welcome gate removed — landing opens straight. Name/mobile live in the trip squad "you" block + new **Profile** option (Navbar chip + My Trips header) to change both anytime (updates current trip too).
- **PhoneInput everywhere**: fixed +91 prefix, numeric-only, 10-digit validation with inline error + save guards. Display formatted (+91 98765 43210).
- **English-only UI**: all user-visible Hinglish strings converted (deletes, archive, errors, SMS, split, meter). Replies also English going forward.

---

## 17. Login profile + custom deletes round
- App opens directly into **Profile Setup**: "What can we call you?" + mobile. The whole app's "you" comes from here (new trips prefilled; trip squad edits also update the profile).
- Navbar back button globe removed (arrow only).
- **Custom delete popup** (native `confirm` gone): "Are you sure?" + red Delete button + X, no Cancel. Trip, expense, transit, stop, ticket, place, shared bill — everywhere.

---

## 16. Squad + trip-create fixes round
- New Trip footer: **2 separate buttons — Save / Add Squad** (merged single button removed).
- Top of the squad step: **"What can we call you?"** block — your name + mobile are dynamic (hardcoded "Apurv" gone).
- **Double (You)(You) fixed** — display layer strips the stored suffix, single (You) everywhere.
- Manual add takes **only Name + Phone** (UPI field removed, all three squad forms).
- Contact-blocked message typo-free and direct: desktop shows the reason + Android app note.
- Squad add silent-fail + custom-cover save bugs (previous round) verified fixed.

---

## 19. Join-code + budget-mapping + sync-hardening round (done)
- **Join with code fixed**: the `supabaseClient` shim had async `select/update/delete` — every chained query crashed. Now sync builders; join, delete, presence, chat-load all work.
- **Invite publish guarantee**: a fresh code is minted when missing/collided; publish failure shows a flash message to the user. Missing `invites` rows self-heal on join.
- **Login repeat-profile fixed**: name/phone/role auto-restore from the server — never asked again on a new device.
- **Per-member budget mapping**: "me" resolves by uid (flag stale-proof); owner gets the total view, budget-less joiners get **₹0 not set** + Set button; trip-create Step 2 has a **My budget** box.
- **Landing refresh**: any name/date/budget/members change reaches everyone (20s poll + focus + landing open); **owner-deleted trips purge from all phones**; removed members lose the trip automatically. Isolation fix (own unpublished trips never dropped).
- **Join mapping**: a pre-added phone-number row is adopted (no duplicate member, budget/split history inherited).
- **Server hardening**: pg NUMERIC/INT8 arrived as strings → **"013244" concat bug** + budget-merge failure. Type parser in `db.cjs` + migration (`expenses/documents.updatedBy`, `documents.remoteUrl`, `todos.text/_deleted/updatedBy`) + backend restart. `Number()` guards across save/load/merge layers.
- **Trip cards**: joiners see no 3-dot menu. Every splitwise bill shows **your share ₹X**. Expense add/update/delete notifications (transparent, bell + loud).

---

## 20. Core Build — Trip / Expense-Splitwise / Chatroom (Spec v1.0, Sep 2026) — TRACKER
> Legend: [x] done · [~] in progress · [ ] todo. Decisions locked: notifications = split-members-only · chat realtime = WebSocket (Socket.io, same server) · "Ongoing" → "In Progress" rename everywhere · Navy/Gold retheme = Phase-3 (deferred, indigo stays).

### Phase 1A — Trip listing (status: done)
- [x] Rename Ongoing → In Progress (labels + status values, app-wide)
- [x] Countdown text: "Starts tomorrow" / "Starts today" / "Day N of M" (In Progress, card + trip banner)
- [x] Sort: In Progress = soonest-ending first · Completed = most-recently-ended first
- [x] Ownership chip relabel: "My Trips" → "Owned by Me"
- [x] Stop writing stored `status` — recompute fresh from dates on create/edit (DB column untouched for compat)

### Phase 1B — Expense & Splitwise (status: done)
- [x] QuickAdd: custom-amount + percentage split types, date picker, payment mode (cash/UPI/…)
- [x] Expense tab restructure: default **Balances** view · secondary **All Expenses** · floating **"+ Log Spend"**
- [x] Real **Settle Up**: persisted + synced settlement, clears debt on the balance ledger only (spend untouched) + undo
- [x] **Expense history**: every edit/delete with timestamp (`expense_events` table + UI section)
- [x] Fix: hardcoded "Split 4 ways" + `/each` equal-assumption · dead `ExpenseModal.tsx` removed
- [x] Notifications split-scope: add/edit/delete notify only that split's members

### Phase 2 — Chat realtime + features (status: done)
- [x] Socket.io server + client wiring (same Express server, rooms `trip:<id>`)
- [x] Live incoming messages · typing indicator · presence (socket room count) · live bell feed
- [x] Pin message (banner + jump) · delete own messages (everywhere) · read receipts (Seen ticks) · tappable links
- [x] Migration: `chat_messages.pinned/_deleted`, `message_reads` table + backend restart + socket probe verified

### Phase-3 (deferred, spec §5)
- [ ] Navy `#16213E` + Gold `#D9A441` + Teal/Rust theme · Fraunces + IBM Plex Sans · stacked-list cards · In Progress dark card + teal edge · budget bar teal→rust · gold chat bubbles · minimal motion

---

## 21. Budget viewer-rule round (owner = trip total, member = own budget)
- Single rule `utils/budget.ts` (`viewerBudget`): owners always see the trip total, members always see their personal budget + share — same mapping on every surface.
- My Trips cards: members no longer see the owner's total — they see their budget + share bar ("Budget not set" hint when unset).
- Top navbar (below the trip name): members see their share of their budget.
- Double "My budget" box removed from trip-create Step 2 (the owner's budget = the Step 1 Total).
- Squad View-all: no input box on the owner's own row — trip total + "(Edit Trip se change)"; members keep the input on their own row; others show "Not set" when unset.
- Squad list tags **JOINED** (green) / **MANUAL** (grey) for friends without the app — visible at a glance.
- Log Spend simplified: **date / Paid-via / percentage-split removed** — entry date auto-today (original date preserved on edit), payment defaults to UPI, splits are Equal + Custom only.

---

## 22. Per-user TODO + profile email edit
- **TODOs are per-user**: `ownerUid` stamping + client filter — medicine/bakery/itinerary are private to whoever wrote them. Sync intact (your todos follow you to other devices). Legacy unattributed todos stay visible to all (transitional).
- **Email change in Profile**: editable email + ghost pencil icon — updates `users.email` in the DB, uniqueness checked ("already registered"), next login uses the new email. Probe-verified.
- **Crash fix**: `myUid` state TDZ ordering (`myTripTodos` read it before initialization during render) — state moved up. ErrorBoundary crash gone.
- **Join chat message**: first-time code join posts a `@Name joined the chat` system message (socket-live + REST fallback, fixed id → no duplicates on rejoin).
---

## 23. Smart notification feed + bell jiggle + fonts
- **Fonts**: reverted to original (Outfit + Plus Jakarta Sans) per feedback — Fraunces/Plex experiment dropped. Colors unchanged (retheme still Phase-3).
- **Parser** (`utils/notifications.ts`): raw logs → structured JSON (category transaction/mention/message/location, actor, messageBody, highlightData, previewText, relativeTime, isUnread). Gibberish test-logs filtered.
- **Unified feed**: expenses + mentions + chat + location in one list, **latest-first sort, cap 30**, category icon-badge, unread red dots, "Unread — N" sticky header, scroller. Splitwise no longer sticks to the top.
- **Bell**: every new notification → **red + jiggle ~2s (same size, rotate-only) + vibrate**. Opening the panel marks everything seen (badge/dots clear, seen-time persisted).
- Chat rows tap → opens chat directly; expense rows are info-only.
- Profile email pencil: heavy button → minimalist ghost icon (line-art, subtle circular tint on hover).
- **Mash-to-siren final**: single tap = local chime + swing · 3-mash = emergency broadcast + shared-context alarm loop + header bell solid-red fill + expanding rings overlay (center badge/banner removed — timeline never blocked) · tap again = instant stop.

---

## 24. Squad privacy: one tag + only-own-budget (screenshot round)
- **Single status tag** (`utils/budget.ts memberStatus`): OWNER or JOINED or MANUAL — never two tags together. Owners never show JOINED.
- **Only your own budget in the squad list**: owner's own row = trip total (no input) · member's own row = input · **other rows show name + number only, no budget line at all** (neither set value nor "Not set").
- Schema: **no migration** — `trips.ownerUid` already holds the single owner; other tables resolve through the trip.
- **Siren everywhere**: single tap also broadcasts (`bell` type message — soft chime + flash on receivers) · emergency rings on the App-root overlay (landing/dashboard/profile, every screen) + persistent via sender heartbeat · dynamic host (LAN IP on phones) so cross-device socket/REST works.
- **@mention overhaul**: exact token regex `/@(\w*)$/` (space = close, dropdown hides instantly), auto-highlight index 0, desktop keys (Up/Down clamp, Enter/Tab select + trailing space, Esc cancel), tap = instant select + focus-back, outside-tap blur close (150ms), double-fire guard, placeholder hint "@ to mention".
- **Chat redesign (Discord/Slack-grade)**: canvas `#f8fafc`, outgoing Royal Indigo gradient (`135deg #4f46e5→#4338ca`, matches the + Log Spend button), incoming white + micro-border, minimalist inline slate system logs + micro-icon (bulky pills gone), 16px pill bubbles, timestamps inside bottom-right (muted `#94a3b8` / `#c7d2fe`), location = map-placeholder media card + CTA button, floating typing bubble (wave-bounce dots 0/0.2/0.4s), **mash-to-siren bell** (borderless; single tap = local 880Hz WebAudio chime + 0.5s swing; 3+ taps/1s = emergency broadcast + shake/ripple loop till next tap).
