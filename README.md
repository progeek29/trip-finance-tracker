# WanderSync

WanderSync helps groups plan trips, track shared spending, split expenses, chat, and keep trip details together.

## Open WanderSync

**Login to WanderSync:** https://trip-finance-tracker.vercel.app/

Open this same login link on a laptop, Android phone, or iPhone. Create an account or log in to see **My Trips**.

**Backend status:** https://wandersync-app.duckdns.org/api/health

The backend URL returns a technical health response. Users should always open the Web app link above.

## Phone access

### Android

The Android APK is built against the live HTTPS backend. The app is not on Google Play yet; Play Store release is coming soon. Until then, install the debug APK from:

`android/app/build/outputs/apk/debug/app-debug.apk`

### iPhone / Safari

1. Open https://trip-finance-tracker.vercel.app in Safari.
2. Log in or create an account.
3. Tap **Share** in Safari.
4. Choose **Add to Home Screen** and open WanderSync from the new icon.

This gives the iPhone an app-like shortcut without needing the App Store. A signed iOS build requires macOS/Xcode and will be prepared for a future App Store/TestFlight release.

## Current release

- Release: `0.4.0` / `prod-v4`
- Login opens directly on My Trips.
- Forgot password uses the minimal Email + New password flow.
- My Trips ownership tabs use a smooth sliding control.
- Production web app and live HTTPS API are configured.

## Next MVP

The next MVP will introduce a discoverable travel marketplace layer while keeping trip tracking intact:

- Featured trip packages, for example **Ladakh — 10D / 9N**.
- Package cards using the same clean trip-card style.
- Package details, itinerary, inclusions, price, dates, and availability.
- Enquiry and booking flow.
- Payment integration, booking confirmation, and admin controls.
- OTP/email verification and stronger account security.

## Docs

- `RUNBOOK.md` — master save-separate file: stack, setup map, daily/DB/Docker commands, release flow, presentation pack.
- `PLATFORM_LOGINS.md` — app + Oracle Cloud + Vercel + DuckDNS login links in one place.
- `UPDATES.md` — release history and completed work.
- `MVP.md` — current scope and next MVP decisions.
- `ANDROID_APK_GUIDE.md` — Android build and install steps.
- `development.md` — setup and deployment notes.
- `PROJECT_DOCUMENT.md` — product specification and roadmap.
