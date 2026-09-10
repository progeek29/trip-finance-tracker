# WanderSync closed-app voice — FCM debug brief (shareable)

> Question for reviewers: why does Google 200-accept our data-only,
> high-priority FCM (fresh token) yet the device never starts our process —
> while notification-only messages to the same device DO arrive?

---

## 1. What we built

Walkie-talkie PTT. App open = works (Socket.io live relay, crystal clear).
Goal: app swipe-killed → voice still plays LOUD + persistent notification.

Pipeline: sender (app open) → socket burst + clip upload → Node server stores
clip (memory, 5-min TTL) → server checks socket presence → FCM **data-only,
high-priority** to offline members only → native `VoiceFirebaseService`
downloads clip → `VoicePlaybackService` (FGS, `mediaPlayback`) plays it.
Download fail → `showMissed` fallback notification. No new server deps,
no DB writes, no Cloudflare worker.

## 2. Exact FCM payload (server sends this, FCM v1 HTTP)

```json
{
  "message": {
    "token": "<fresh FCM token>",
    "data": {
      "kind": "voice",
      "title": "<sender> • voice",
      "body": "Tap to open trip & reply",
      "tripId": "trip_1788988652311",
      "clipId": "<24-hex>",
      "senderName": "<sender>",
      "clipUrl": "https://wandersync-app.duckdns.org/api/voice-clips/<clipId>"
    },
    "android": { "priority": "high", "ttl": "300s" }
  }
}
```

- No `notification` block (deliberate: notification payload bypasses
  `onMessageReceived` on dead apps — data must reach our service).
- Raw FCM v1 via service-account OAuth (Node `crypto`, no firebase-admin).
- Project: `wandersync-e31dc` (app `google-services.json` matches).

## 3. Native (Capacitor 6 app, `com.wandersync.tripapp`, targetSdk 34, debug APK)

- `VoiceFirebaseService extends FirebaseMessagingService`: kind==voice +
  background → download clip JSON → `VoicePlaybackService.start()`;
  download fail → `showMissed()` notification + vibrate. Foreground →
  forwards to Capacitor plugin (socket owns playback, clipId dedupe).
  Non-voice → forwards to Capacitor plugin. `onNewToken` → forwards.
- `VoicePlaybackService`: FGS `mediaPlayback`, wake-lock, full-volume
  MediaPlayer, Stop action, tap-to-trip, records last-played for JS guard.
- **Single FCM entry point**: Capacitor's `MessagingService` removed from
  merged manifest (`tools:node="remove"`) — verified: merged manifest
  contains ONLY `.VoiceFirebaseService` (+ SDK's stock base-class entry).
- Permissions: RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, FOREGROUND_SERVICE,
  FOREGROUND_SERVICE_MEDIA_PLAYBACK, POST_NOTIFICATIONS, WAKE_LOCK, INTERNET.
- APK verified by dex-strings (service classes + fallback strings present).

## 4. Verified working (with evidence)

| # | Fact | Evidence |
|---|------|----------|
| 1 | Server chain end-to-end | Logs: `voice burst live` → `voice clip stored` → `fan-out check … targets=1` → `voice FCM: 1/1 offline` |
| 2 | FCM creds + send path | FCM v1 returns 200 + message name (repeatedly) |
| 3 | Token fresh | `push_tokens` re-registered on every fresh install + trip open (prefix changes each install) |
| 4 | Project match | App `google-services.json` project `wandersync-e31dc` == service-account project |
| 5 | GMS on device works | `adb logcat`: `Start proc … org.telegram.messenger … FirebaseInstanceIdReceiver` (other app's FCM arrives) |
| 6 | Notification path works | Notification-only test pushes ("WanderSync test 3", "Split test") ARRIVED on device |
| 7 | Our process DID start once | Logcat 13:39: `Start proc … com.wandersync.tripapp … FirebaseInstanceIdReceiver` after a voice FCM |
| 8 | No crash | Never any `AndroidRuntime` / `VoiceFCM` / `VoicePlay` lines for our package |
| 9 | Presence correct | Fan-out logs show `online=1 [sender] targets=1` when phone killed |

Device: Samsung S22+, WiFi on, no DND, battery set Unrestricted,
background-data allowed, screen-ON tests done. ~20 high-priority test
pushes sent over ~2h of debugging (quota angle considered).

## 5. The failure (consistent, reproduced 10+ times)

Data-only voice FCM → Google 200-accepts (`voice FCM: 1/1`) → **device never
starts our process** (no `Start proc`, no service lines, no crash, no
notification, no audio). Notification-only messages to the same device
arrive fine. One data message DID start our process at 13:39 (then silence
since — token has since rotated via reinstalls; current token proven for
notification delivery via "Split test").

## 6. Ruled out

- Wrong/stale token (re-registered, server targets it, Google 200s it)
- Wrong Firebase project (both sides `wandersync-e31dc`)
- Notification payload bypass (removed; payload is data-only)
- Dual-service dispatch conflict (Capacitor service removed, merged manifest verified)
- App-code crash on receipt (no `AndroidRuntime` ever)
- Server presence logic (logs prove `targets=1`)
- Doze/screen-off (screen-ON + Unrestricted-battery tests fail identically)
- APK mismatch (dex-verified: single service + fallback strings in installed build lineage; versionCode 4 / v1.3)

## 7. Open hypotheses (need help ranking)

1. **FCM high-priority quota/throttle** from the test barrage (~20 in 2h):
   accepted-then-held by Google, `FcmRetry` alarm seen once in logcat.
   Counter: notification-only tests arrived interleaved in the same window.
2. **Doze/App-standby bucket** despite Unrestricted setting (Samsung
   re-bucketing): `DOZE_WAKE_LOCK` + `FcmRetry` lines present in one capture.
   Counter: screen-ON + charging tests also silent.
3. **Token↔device mismatch**: 200-accept proves registration, not which
   physical device holds it. Single phone in play; reinstalls rotate tokens;
   current token registered from the test device's trip-open — but never
   *proven* on-device (no arrival ever).
4. Something in the data payload Google dislikes (key names? `clipUrl`?
   total size ~200B, well under 4KB).

## 8. What would settle it

- A way to confirm, for one accepted message ID, whether Google attempted
  delivery (FCM delivery data / BigQuery export) vs dropped/throttled it.
- Or: minimal repro — data-only high-priority push to this token from
  Firebase console "test message" equivalent, bypassing our server entirely.
- Relevant code: `server/index.cjs` (fanOutVoiceClip), `android/.../VoiceFirebaseService.java`,
  `VoicePlaybackService.java`, `AndroidManifest.xml`, `deploy/docker-compose.yml`
  (secrets mount + env passthrough — both verified working in container).
