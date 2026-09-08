# WanderSync — Updates Log (kya-kya bana/fix hua)

> App: Trip Finance & Travel Sync (React 19 + Vite + TS + Tailwind v4)
> Har entry = live in app, build passing. Server: `npm run dev -- --host 0.0.0.0 --port 5173`

---

## 1. Vault — Tickets & Passes (full CRUD)
- Ticket add / edit / delete: title, category (ticket/hotel/id/visa/insurance/rental/other), PNR/Ref no., notes.
- File upload: image, PDF, boarding pass, CSV, TXT, DOC — stored offline in browser.
- **PNR copy**: tap Ref chip → copied (card + preview both).
- Uploaded file card pe dikhta hai — image thumbnail, baaki files ka labeled chip (PDF/CSV…).
- **Direct open**: image → in-app preview; PDF/file → seedha new tab (double popup hata diya).
- Preview me sirf actual file; kuch upload nahi to empty box nahi — "Upload file" button.
- Edit me hamesha Change file + Remove file option.

## 2. Stay spotlight (hotel tickets)
- Category `hotel` select karne pe **"About this stay"** block: write-up (naam, rate, inclusions) + multi stay photos.
- Vault card pe **"🏨 Our Stay"** section — landing pe dikhta hai ye hamara stay hai.

## 3. Places & Fares (multi-photo)
- Add / edit / delete: naam, city, category, fare + cost-type, description, tip.
- **Multiple photo upload** (ek saath kayi), per-photo delete, pehli photo = Cover.
- Apni photo lagate hi default image hat jata hai; kuch na chuno to default lagta hai.
- Card pe cover + thumbnail strip (+N overflow).
- Edit me wahi options (URL box hata diya — sirf Upload).

## 4. Shared Photos (gallery)
- Add (multi), edit (retake/change/remove/caption/location), delete.
- **Camera button** (`capture=environment`), gallery multi-upload, URL add.
- Koi image nahi to **default trip image** — kabhi broken tile nahi.
- **Like toggle**: tap = like (pink ♥ +1), dobara tap = unlike (−1, 0 se neeche nahi). Likes phone me saved.
- **Free share**: phone pe native share sheet (WhatsApp/Instagram), desktop pe link copy ya file download.

## 5. Trip — Itinerary & Transit (CRUD)
- Stops: add / edit / delete (naam, state, dates, budget, notes), per-stop spent live.
- Transit: poori list (pehle sirf 1 card tha) — add / edit / delete, PNR copy har card pe.
- **PNR autofetch**: transit form me "🎟 Autofetch PNR from vault ticket" dropdown — ticket chuno, PNR + title auto-fill.

## 6. Squad members (har jagah same CRUD)
- Trip Create, Edit Trip, aur Trip-tab Squad modal — teeno me add / edit / delete.
- Naye member ko **random cool profile photo** (DiceBear) auto; ↻ se shuffle.
- Contact Picker fix (Android Chrome): sahi API detection + manual add fallback.

## 7. Reminders (simple, confusion-free)
- **Ticket ka 🔔 usi pe**: ticket form me date-time + free-text note ("kuch bhi likho"); card pe countdown (`🔔 in 3 days • Sep 20, 06:15 — note`).
- **Trip countdown banner**: Trip kholte hi upar — "🎒 Starts in X days" / LIVE strip. Miss nahi hoga.
- Nayi trip bante hi "starts in 2 days — pack up!" reminder auto (Trip tab list me, editable).

## 8. Splitwise (selective split)
- "Split with 4 friends" checkbox hata ke **member picker**: default full squad, per-member include/exclude chips, live per-head math (₹X ÷ N).
- Shared Bills list with add / edit / delete + settle + UPI QR (jaisa tha).

## 9. Bank SMS auto-logging
- Hooks-order bug fix (parser state reset nahi hota tha).
- Parser broad: zyada debit keywords, 3 amount patterns, zyada banks (HDFC/SBI/ICICI/Axis/Kotak/Yes/PNB/Canara/PhonePe/Paytm/GPay/BHIM/Amazon Pay).
- **Auto-Read SMS** button: WebOTP (Android) + clipboard fallback + sample SMS test.
- Expense me date field (trip window ke andar).

## 10. Custom calendar (apni UI, native nahi)
- `DatePicker` component: month grid (Monday start), selected = indigo, today = ring, out-of-range grey, Today/Clear.
- Transit ke liye `withTime` (hour + minute + Set).
- Sab jagah same: expense date, trip/stop dates, transit datetimes.

## 11. Landing + Trip cards UX
- Trip cards: boxed "Open" hata ke sirf colored **>** chevron (box nahi).
- Broken avatar ki jagah initials fallback (har jagah `MemberAvatar`).
- Trip tab: **Total Spent card → Expenses history** pe jump; **Squad card → members modal** (CRUD).

## 12. Fail-safes (app kabhi "fat-ti" nahi)
- **Image auto-resize** (1280px JPEG): 7–8MB photo save pe crash karta tha — root fix.
- **Storage quota guard**: har save try/catch — full hone pe message, white screen nahi.
- **15MB cap** on non-image files (bhaari PDF pehle hi rok, clear message).
- **Global ErrorBoundary**: kahin bhi crash → recovery screen (Retry, data safe) — dead tab nahi.
- **Reload-proof navigation**: refresh ke baad wahi trip + wahi tab (session restore).

## 13. Storage / godown foundation (APK + scale ready)
- `storageProvider.ts` abstraction: aaj local, kal cloud — UI nahi badlegi.
- **IndexedDB big godown**: photos, tickets, stay/place images, trip covers — **full quality, bina compress** — phone me offline (GBs capacity). UI 100% same (`MediaImg` component).
- Purana data boot pe auto-migrate; delete/archive pe blobs bhi saaf (orphan nahi).
- **Trip Storage meter** (Vault top): real godown bytes + photos + files.
- **Archive Trip**: Step 1 full backup download (full-quality photos + tickets + expenses + sab), Step 2 phone se media saaf (history rehta hai).
- Bucket plan ready: `trip_<id>/{originals,thumbs,docs}` + quota meter + rotation.

## 14. Phone testing
- Dev server `0.0.0.0:5173` (IPv4, phone reachable) + LAN verified HTTP 200.
- In-app "Test on Phone" QR → `http://192.168.1.12:5173` (same Wi-Fi; Node.js ko firewall allow karna ho to ek tick).

---

## Agle steps (decided order)
1. **Supabase sync** (DB + realtime + storage buckets) — text chat room isi ke saath.
2. **PDF page thumbnails** (pdf.js, free, on-device).
3. **APK build** (Capacitor) → doston me WhatsApp pe → Play Store ($25 one-time).
4. **Live walkie-talkie PTT — Ten-Ten style** (WebRTC, press-hold talk, APK ke saath; voice notes nahi, seedha live).
5. Monthly finance tracker, iPhone PWA link.

---

## 15. Simplify round (user-friendly first)
- **Zero emoji** in buttons/labels app-wide; squad faces = simple emoji avatars (photos later); new WanderSync compass logo (Navbar + landing).
- **No Cancel buttons** in popups; single centered **Save** button everywhere (X stays for dismiss).
- **No "+" prefixes** on button text anywhere.
- **Custom dropdowns** (Who Paid, payment mode, transit type, ticket category, PNR pick) — basic native selects gone.
- **Calendar fixed grid** (42 cells) — month change pe size jump nahi.
- **Itinerary = simple spots list** (name only, add/edit/remove, day-count from trip dates). No per-stop dates/budgets. "Cities/Stops" renamed Itinerary. Trip extend = edit trip dates.
- **Squad add collapsible**: list + "Add Member" box → click pe manual/contact options. Contact errors now shown on screen.
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
- App kholte hi **Profile Setup**: "What can we call you?" + mobile. Poori app me "you" yahin se (naye trips prefilled; trip squad edit bhi profile update karta hai).
- Navbar back button se **globe hata diya** (sirf arrow).
- **Custom delete popup** (native `confirm` khatam): "Are you sure?" + red Delete button + X, no Cancel. Trip, expense, transit, stop, ticket, place, shared bill — sab jagah.

---

## 16. Squad + trip-create fixes round
- New Trip footer: **2 alag buttons — Save / Add Squad** (merged single button hata diya).
- Squad step me sabse upar **"What can we call you?"** block — tumhara naam + mobile dynamic (hardcoded "Apurv" khatam).
- **Double (You)(You) fixed** — display layer strips stored suffix, har jagah single (You).
- Manual add me **sirf Name + Phone** (UPI field hataya, teeno squad forms me).
- Contact-blocked message typo-free aur seedha: desktop pe reason + Android app note.
- Squad add silent-fail + custom-cover save bugs (pichle round) verified fixed.
