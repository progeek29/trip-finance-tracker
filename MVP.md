# WanderSync MVP Product Plan

## Product vision

WanderSync is a travel companion that combines two connected experiences:

1. **Trip tracking for people who already have a trip**: plan the itinerary, manage the squad, track shared expenses, split bills, chat, store trip documents, and keep everyone in sync.
2. **Trip discovery and booking for people who are looking for a trip**: browse attractive, ready-made travel packages, understand the itinerary and price, book a package, and pay securely.

The product should feel like one coherent travel app. A user can discover a package, book it, and then use the same trip-tracking tools for that journey.

## Current release foundation

The current release is focused on a stable, simple core experience:

- Email and password sign-up and login.
- Login lands directly on **My Trips**.
- My Trips supports **All**, **Owner**, and **Joined** views.
- Ownership filtering uses a smooth sliding control and keeps the existing visual theme.
- Users can create trips, add members, manage itineraries, and view trip status.
- Shared expenses, budgets, balances, Splitwise-style settlement, and expense history are supported.
- Trip chat supports realtime messages, presence, typing, mentions, read receipts, links, and notifications.
- The backend runs on the live HTTPS API and data is stored in PostgreSQL.
- Android debug APK builds are connected to the live backend.
- The web app works on desktop, Android browsers, and iPhone Safari.
- iPhone users can use Safari **Add to Home Screen** for an app-like experience.

## Authentication and account decisions

- The current forgot-password flow intentionally remains minimal: **Email + New password**.
- On success, the password is updated in the database and the user is returned to Login with a success message.
- The next MVP must add OTP or email verification before allowing sensitive account recovery and public booking actions.
- Passwords must always be hashed server-side and must never be returned by an API.
- Add rate limits, abuse protection, duplicate-account checks, and clear error messages before public launch.
- Profile name, mobile number, and email should remain editable with proper validation.

## Next MVP: discover, book, and pay

The next MVP must add a travel marketplace layer without breaking the existing trip tracker.

## Payment integration kickoff: today

Payment integration work starts today, but live money movement remains disabled until the complete flow is verified. The implementation order is:

1. Select the payment provider and document the server-side API/webhook contract.
2. Add package, booking, order, payment, refund, and webhook-event data models.
3. Create a server-side order before opening checkout; never trust a client-supplied amount or success flag.
4. Add a sandbox checkout with payment-pending, success, failure, retry, cancellation, and refund states.
5. Verify webhook signatures and make webhook/order handling idempotent.
6. Add admin visibility for orders, payments, refunds, and reconciliation errors.
7. Test the full sandbox flow on web, Android, and iPhone Safari/PWA.
8. Enable live payments only after backups, rate limits, monitoring, reconciliation, and rollback procedures are ready.

The current VM is sufficient for this phase: 2 OCPU, 10 GB RAM, approximately 19 GB free disk, approximately 49 MB PostgreSQL data, and approximately 1.1 GB active RAM usage. Payment provider card data must remain with the provider; WanderSync stores only the minimum order, booking, status, and verification metadata required for the product.

## Lightweight avatar decision

- The application header/profile icon keeps the existing single initial style.
- Squad/member avatars use name initials such as `J` for John and `Z` for Zon.
- No avatar images, DiceBear downloads, or per-user media storage are required.
- This keeps the UI fast and avoids avatar-related storage and network usage.

## Closed-app voice and notification work

The current walkie-talkie implementation is a live WebSocket voice burst. It works when the app is open and the user has granted microphone access, but it is not a closed-app voice system yet.

This is a required next-MVP native feature and must not be marked complete until all of the following are implemented:

- Android foreground service for the PTT session.
- Persistent Android notification while the voice service is active.
- Native microphone permission request and clear Settings fallback.
- Push/wake delivery through the FCM worker when the receiving app is backgrounded or closed.
- Server-side sender/device-token validation and sender exclusion.
- Short-lived voice payloads with no permanent audio storage by default.
- Automatic service shutdown, timeout, and battery safeguards.
- Android notification-channel and lock-screen behavior tested on real devices.
- Reconnect and offline failure states that never show a false “sent” message.

The current release only provides the microphone permission declaration, foreground PTT permission prompt, local notification channel initialization, and live in-app voice path. Closed-app voice remains **planned**, because it requires native service code plus configured FCM worker secrets and real-device validation.

### Notification delivery states

- **In-app activity feed**: available while the app is running.
- **Local Android notification**: available after notification permission and channel initialization.
- **Closed-app remote push**: requires the deployed FCM worker URL, valid Firebase service credentials, registered device tokens, and verified worker delivery.

The app must never claim that a closed-app voice message was delivered until the push provider acknowledges the request.

### 1. Featured package cards

Add a package/discovery section using the same clean card language as the current trip cards. The cards should be visually attractive enough to make users want to explore and book a trip.

The first sample package can be:

- **Ladakh — 10D / 9N**

Each package card should show, at a glance:

- Destination and package title.
- Duration, such as `10D / 9N`.
- Cover image.
- Starting price or total price.
- Travel dates or date flexibility.
- Short highlights.
- Availability status.
- A clear action such as **View Package** or **Book Now**.

The cards should reuse the existing trip-card visual style so the marketplace feels native to WanderSync rather than like a separate website.

### 2. Package details

The package details screen must include:

- Photo gallery and destination overview.
- Day-by-day itinerary.
- Inclusions and exclusions.
- Hotel, transport, meal, and activity details where applicable.
- Price breakdown and taxes or fees.
- Available dates, capacity, and remaining seats.
- Cancellation and refund policy.
- Organiser/contact information.
- Share package action.
- Enquiry and booking actions.

### 3. Booking flow

The booking flow should be simple and trustworthy:

1. User selects a package and date.
2. User enters traveller details and number of people.
3. The app shows the full price before payment.
4. User confirms the booking information.
5. User completes payment.
6. The app verifies the payment on the server.
7. The booking becomes confirmed only after verified payment.
8. The booking creates or opens a trackable trip in WanderSync.

Booking states must include:

- Enquiry
- Payment pending
- Confirmed
- Cancelled
- Refund pending
- Refunded

### 4. Payments

Payment integration is part of the next MVP. It must include:

- A trusted payment provider with server-side verification.
- No client-only payment success state.
- Idempotent payment and booking creation.
- Order/payment/booking IDs stored separately.
- Webhook handling for success, failure, cancellation, and refund events.
- Clear payment failure and retry states.
- Booking confirmation after verified payment only.
- Admin visibility into payment and refund status.
- Secure handling of customer and transaction data.

Do not collect live payments until the complete booking, verification, cancellation, and refund flow has been tested end to end.

### 5. Admin marketplace controls

Admin users must be able to:

- View users with safe, non-sensitive metadata.
- Create, edit, publish, unpublish, and delete packages.
- Manage package images, itinerary, price, dates, capacity, inclusions, and policies.
- View enquiries, bookings, payment state, cancellations, and refunds.
- Update availability without corrupting existing bookings.
- Reset user passwords without seeing existing passwords.
- Keep an audit trail for important booking and payment changes.

## Existing trip-tracking scope to preserve

The marketplace must not replace the reason users return to WanderSync. The following features remain part of the product:

- My Trips with All, Owner, and Joined filters.
- Trip creation, editing, deletion, ownership, and member joining.
- Itinerary and transit management.
- Squad/member management and contact-picker support.
- Personal budgets, shared budgets, expense logging, balances, and settlement.
- Expense history and member-scoped notifications.
- Realtime trip chat, mentions, presence, read receipts, and shared context alerts.
- Trip reminders and date-based status/countdown.
- Ticket, pass, hotel, and document vault with safer upload handling.
- Shared photos and travel memories when that section is ready.
- Offline-friendly local storage and future cloud sync.
- Live Android testing and iPhone Safari/PWA testing.

## Vault and document policy

Vault functionality should remain controlled until the storage and security policy is ready:

- Restore or confirm the Vault entry only with a clear upload policy.
- Keep file-size limits and image resizing.
- Preserve local/offline behavior while cloud storage is designed.
- Add secure access rules before sensitive documents are stored remotely.
- Do not expose private ticket, passport, identity, or insurance files to other trip members by default.

## Platform plan

### Web

- Production URL: `https://trip-finance-tracker.vercel.app`
- Must work on desktop, Android Chrome, and iPhone Safari.
- Keep the login and My Trips journey fast and clear.
- Maintain PWA metadata and the Safari **Add to Home Screen** experience.

### Android

- Continue live-backend APK testing before Play Store submission.
- Test login, password reset, trip creation, expenses, chat, permissions, offline behavior, and SMS features on real devices.
- Prepare a signed release build and Play Store listing after QA.
- Google Play release is planned; the app is not listed yet.

### iPhone / iOS

- Use the production web app through Safari for immediate testing.
- Support **Share → Add to Home Screen** as the current app-like path.
- A signed native iOS build requires macOS, Xcode, Apple Developer setup, and TestFlight/App Store review.
- Validate Safari layout, login, PWA launch, uploads, notifications limitations, and payment checkout before native iOS work.

## Release gates for the next MVP

Before public booking is enabled:

- Android real-device QA is complete.
- iPhone Safari/PWA QA is complete.
- Login and password recovery are verified against the database.
- OTP/email verification is enabled for sensitive actions.
- Package availability cannot oversell inventory.
- Payment success is server-verified.
- Cancellation and refund states are tested.
- Admin booking and payment views are working.
- No sensitive password or payment data appears in logs or API responses.
- Production backups, monitoring, and error reporting are configured.

## Explicit non-goals for the current release

- Live payment capture before the booking flow is verified.
- Public package booking before inventory and payment reconciliation are ready.
- Native signed iOS release from Windows alone.
- Uncontrolled vault uploads or insecure document sharing.
- Magic login or account recovery without identity verification.
- Adding filler features before the core trip, package, booking, and payment journey is stable.

## Product principle

Every future feature should answer one of these questions:

- Does it help a traveller discover a good trip?
- Does it help them book it safely?
- Does it help the group plan and track the trip?
- Does it help the organiser operate the trip reliably?

Features that do not support one of these four outcomes should remain outside the MVP until the core experience is stable.
# WanderSync MVP Plan

## Current focus
- Keep the live web app, Android build, and iPhone Safari experience stable.
- Turn WanderSync from a trip tracker into a trip discovery and booking product in the next MVP.
- Keep payments and identity verification behind a controlled release until the booking flow is tested end to end.

## Short-term product decisions
- Forgot password is intentionally minimal for now: email + new password only.
- Next version will add OTP/email-verification and stricter security checks.
- Payment integration is planned for the next MVP together with package booking.
- Admin flow must show the full user list with safe read-only metadata.
- The app should land on My Trips after login for a smoother user experience.

## UX changes already applied
- Removed the old landing-page reminder text about shared data across devices.
- Removed the `if a friend shared one` note from signup/invite fields.
- Simplified forgot-password to the MVP flow: Email + New password.
- Login redirects into the main app, landing on My Trips.

## Planned next MVP: discover, book, and pay
1. Add featured package cards inside the existing trip discovery experience.
2. Start with sample packages such as `Ladakh — 10D / 9N`, with dates, price, itinerary, inclusions, and availability.
3. Add a package details view that reuses the existing trip-card visual language.
4. Add enquiry and booking states: interested, pending, confirmed, cancelled.
5. Add payment checkout with server-side verification, payment status, and booking confirmation.
6. Add admin tools for package CRUD, inventory, pricing, and booking management.
7. Add OTP/email verification and rate limits before public booking goes live.
8. Keep Android live testing and iPhone Safari PWA testing as release gates.

## Non-goals for this MVP
- Same-device login magic with no identity verification.
- Full vault file security and storage policy.
- Live payment capture before the booking flow is verified.
- Multi-factor authentication rollout.

## Notes
This file is a working product note for the current MVP, and is intentionally scoped to a simpler, safer release path.
