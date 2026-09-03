# Trip Finance & Travel Sync App (WanderSync)
## Product Architecture, Feature Specification & Phased Roadmap

A comprehensive, modular trip finance tracker, group expense splitter ("Splitwise" engine), itinerary date & transit reminder, document vault, shared photo/video journal, and community place discovery platform.

---

## 1. Original User Requirements & Feature Breakdown

### A. Trip Setup & Transit/Date Tracker
- **Trip Lifecycle**: Countdown to start date (e.g. Sep 20, 2026), active trip status banner, and post-trip archived summary.
- **Multi-City Itinerary**: Organize trips by destinations/stops (e.g., North Goa $\rightarrow$ South Goa).
- **Transit Reminders**: Flight, train, bus, and cab schedules with automatic countdown alerts, PNR copy, and calendar synchronization (`.ics`).

### B. Expense Tracking & Financial Analytics
- **Budgeting**: Set total trip budget and per-city/per-day budget limits.
- **Categorized Logging**: Food, Transit, Stay, Activities, Shopping, Fuel, Emergency, Drinks, and Cash withdrawals.
- **Visual Analytics**: Interactive spend charts (donut breakdown, daily spending trends, budget burn rate, city-wise cost comparisons).
- **Cash & Manual Edits**: Log cash transactions with instant balance recalibration, edit/delete options, and audit history.
- **Post-Trip Financial Report**: Printable/exportable PDF/CSV summary of total spent, top categories, and savings vs. target.

### C. Group Collaboration & "Splitwise" Engine
- **Multi-Friend Sync**: Connect friends (e.g., group of 4 traveling to Goa) via invite code or shared trip link.
- **Custom Split Modes**: Split Equally, Split by Exact Amount, Split by Percentage, or Custom Shares.
- **Minimum Transaction Settlement Algorithm**: Simplifies group debts into the fewest possible payments (e.g., instead of 6 payments between 4 friends, optimizes to 2-3 transfers).
- **Balance Matrix**: Real-time "Who owes whom" summary with one-click "Mark as Settled" and UPI QR codes.

### D. Smart Bank SMS & Debit Auto-Logging
- **Web/PWA SMS Ingestion**: Built-in Regex Parser for Indian and international bank debit SMS (HDFC, SBI, ICICI, Axis, PayTM, PhonePe, GPay debit alerts) where users can paste raw SMS.
- **Automatic Matcher**: Checks if the debit occurred within the active trip date window and automatically extracts amount, merchant, and category.
- **Editable & Verifiable**: Every auto-parsed transaction is flagged for quick 1-tap review/confirmation.

### E. Important Document & Ticket Vault
- **Encrypted Local/Cloud Vault**: Store boarding passes, train tickets, hotel bookings, ID proofs, visa passes, and rental agreements.
- **Quick Offline View**: Instant access to QR codes, seat numbers, PNRs, and PDF/image previews even with poor connectivity.

### F. Shared Group Media Vault & Trip Timeline
- **Live Group Photo & Video Stream**: All group members can upload snaps during the trip in high resolution.
- **Timeline & Geo-Tagged Moments**: Chronological feed of memories pinned to specific stops or days.
- **Batch Download & Likes**: One-click download of all trip photos with like counter.

### G. Public Travel Recommendations & Community Discovery
- **Must-Visit Places & Stays**: User-curated recommendations with verified actual expenses (stay costs, food prices, entry fares).
- **Public Trip Stories**: Make select spots or reviews public so fellow travelers planning a visit can see real budget insights.

---

## 2. 100% Free Tools, Free Tiers & Open-Source Stack

| Layer | Tool / Library | Free Tier Limits / Open-Source Benefit |
| :--- | :--- | :--- |
| **Frontend Framework** | **React 19 + Vite + TypeScript** | 100% Free, lightning fast, highly modular component structure |
| **Styling & Design System** | **TailwindCSS v4 + Minimalist Glassmorphism** | Modern aesthetic, dark theme tokens, clean mobile-first layout |
| **Charts & Visualizations** | **Recharts** | 100% Free, highly customizable responsive charts |
| **Icons & Micro-animations** | **Lucide-React + Canvas Confetti** | Crisp vector iconography & smooth layout transitions |
| **Backend & Real-Time Sync** | **Supabase (Free Tier)** or **Firebase (Spark Free)** | **Supabase**: 500MB Postgres DB, 1GB file storage, Realtime WebSocket sync.<br>**Firebase**: 1GB Firestore, 5GB storage, free hosting. |
| **Maps & Places API** | **OpenStreetMap + Leaflet.js / Nominatim** | 100% Free & Open Source (No credit card needed, no billing surprises) |
| **Currency Conversion** | **Frankfurter API / ExchangeRate-API** | 100% Free open-source currency rates without API key requirements |
| **File / Media Storage** | **Supabase Storage / Cloudinary (Free)** | Cloudinary: 25GB free monthly bandwidth/storage |
| **Reminders & Calendar** | **Web Notifications API + iCalendar (.ics)** | Native browser push notifications & native calendar sync |
| **Mobile Packaging (Later)** | **Capacitor.js / Ionic** | Wraps the web app into an Android `.apk` with native Android SMS reading permissions |

---

## 3. UI Refactoring & Clean Design Architecture (Completed)

Following user feedback that the initial dashboard had *"too many things at once"*, the app was restructured into a **calm, clean, 4-tab progressive disclosure layout**:

1. **🧭 Trip Tab**: Minimalist hero card, next transit alert (e.g. IndiGo flight with PNR copy), city itinerary stops.
2. **💳 Expenses Tab**: Big clear spend figure (`₹48,800`), cash vs. online split, quick filter pills, and itemized ledger with CSV export.
3. **👥 Splitwise Tab**: Net balance card (+₹10,400), simplified 1-on-1 settlements, UPI QR payment modal with confetti.
4. **🗂 Vault & Media Tab**: 3-in-1 tabbed switcher for Tickets/Passes, Group Photos, and Curated Places with real fares.
5. **⚡ Quick Add Modal**: Single fast-entry modal for Cash, UPI, Card, and Bank SMS auto-parsing.

---

## 4. Upscaling & Commercial Roadmap

- **Phase 1 (Current)**: High-fidelity web/PWA with offline local storage persistence.
- **Phase 2 (Cloud Sync)**: Free Supabase/Firebase multi-user live sync with real-time updates.
- **Phase 3 (Mobile)**: Android APK using Capacitor with background SMS reading permissions.
- **Phase 4 (Commercial)**: In-app direct payment gateways (UPI / Stripe / Razorpay) & flight/bus/hotel booking integrations.
