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
