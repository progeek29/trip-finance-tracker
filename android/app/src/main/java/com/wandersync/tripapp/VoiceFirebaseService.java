package com.wandersync.tripapp;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Process;
import android.app.PendingIntent;
import android.util.Log;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;
import java.util.Map;

/**
 * Closed-app voice wake-up. FCM data messages (kind=voice) arrive even when the
 * app is killed; this service downloads the short-TTL clip and hands it to
 * VoicePlaybackService (foreground, LOUD). No clip bytes in FCM (4KB limit).
 *
 * Visibility is owned by the FCM system-tray notification (server always sends
 * a notification payload too), so this service posts NO notifications itself —
 * it only plays audio. Foreground case is skipped (socket/JS owns playback).
 */
public class VoiceFirebaseService extends FirebaseMessagingService {
  static final String TAG = "VoiceFCM";
  static final String CHANNEL_ID = "wandersync_voice";
  static final String PREFS = "wandersync_voice";
  static final String KEY_TRIP = "pending_voice_trip";
  static final String KEY_CLIP = "pending_voice_clip";
  static final String KEY_LAST_PLAYED = "last_voice_played";
  static final String KEY_LAST_PLAYED_AT = "last_voice_played_at";
  static final String EXTRA_TRIP = "voice_trip_id";
  static final String EXTRA_CLIP = "voice_clip_id";
  private static final int MAX_CLIP_BYTES = 8 * 1024 * 1024;

  @Override
  public void onMessageReceived(RemoteMessage msg) {
    Map<String, String> d = msg.getData();
    // Single-service design (Capacitor's MessagingService is removed in the
    // manifest): everything flows through here. Non-voice + foreground voice
    // go to the JS layer exactly like before; background voice plays natively.
    if (d == null || !"voice".equals(d.get("kind"))) {
      PushNotificationsPlugin.sendRemoteMessage(msg);
      return;
    }
    if (isForeground()) {
      PushNotificationsPlugin.sendRemoteMessage(msg); // socket/JS owns it (dedupe by clipId)
      return;
    }
    String tripId = d.get("tripId");
    String clipUrl = d.get("clipUrl");
    String sender = d.get("senderName");
    if (sender == null || sender.isEmpty()) sender = "Squad";
    if (tripId == null || tripId.isEmpty() || clipUrl == null) return;
    String file = null;
    try {
      file = downloadClip(clipUrl);
    } catch (Exception e) {
      Log.w(TAG, "clip download threw: " + e.getMessage());
    }
    if (file != null) {
      VoicePlaybackService.start(this, file, sender, tripId, d.get("clipId"));
    } else {
      // Stream setup failed/timed out — never leave the user in silence.
      showMissed(tripId, d.get("clipId"), sender);
    }
  }

  @Override
  public void onNewToken(String token) {
    // Token registration still flows to the Capacitor push plugin + JS layer.
    PushNotificationsPlugin.onNewToken(token);
  }

  static void ensureChannel(Context ctx) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    android.app.NotificationManager nm =
      (android.app.NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
    android.app.NotificationChannel ch = new android.app.NotificationChannel(
      CHANNEL_ID, "Voice messages", android.app.NotificationManager.IMPORTANCE_HIGH);
    ch.setDescription("Walkie-talkie voice bursts, even when the app is closed");
    nm.createNotificationChannel(ch);
  }

  private boolean isForeground() {
    try {
      ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
      if (am == null) return false;
      List<ActivityManager.RunningAppProcessInfo> ps = am.getRunningAppProcesses();
      if (ps == null) return false;
      for (ActivityManager.RunningAppProcessInfo p : ps) {
        if (p.pid == Process.myPid()) {
          return p.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND;
        }
      }
    } catch (Exception ignored) { /* assume background */ }
    return false;
  }

  static void stashPending(Context ctx, String tripId, String clipId) {    ctx.getSharedPreferences(PREFS, MODE_PRIVATE).edit()
      .putString(KEY_TRIP, tripId)
      .putString(KEY_CLIP, clipId == null ? "" : clipId)
      .apply();
  }

  static PendingIntent openTripIntent(Context ctx, String tripId, String clipId) {
    Intent i = new Intent(ctx, MainActivity.class);
    i.putExtra(EXTRA_TRIP, tripId);
    if (clipId != null) i.putExtra(EXTRA_CLIP, clipId);
    i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    return PendingIntent.getActivity(ctx, (tripId + clipId).hashCode(), i,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  /** Fallback: stream failed — stash trip + loud miss notification (tap opens trip). */
  private void showMissed(String tripId, String clipId, String sender) {
    try {
      ensureChannel(this);
      stashPending(this, tripId, clipId);
      androidx.core.app.NotificationCompat.Builder b =
        new androidx.core.app.NotificationCompat.Builder(this, CHANNEL_ID)
          .setSmallIcon(R.mipmap.ic_launcher)
          .setContentTitle(sender + " • voice")
          .setContentText("Tap to open trip & listen")
          .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
          .setAutoCancel(true)
          .setContentIntent(openTripIntent(this, tripId, clipId));
      android.app.NotificationManager nm =
        (android.app.NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
      if (nm != null) nm.notify((int) (System.currentTimeMillis() % Integer.MAX_VALUE), b.build());
      try {
        android.os.Vibrator vib = (android.os.Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (vib != null && vib.hasVibrator()) vib.vibrate(new long[]{0, 400, 150, 400}, -1);
      } catch (Exception ignored) { /* no vibrator */ }
    } catch (Exception e) {
      Log.w(TAG, "missed notify failed: " + e.getMessage());
    }
  }

  /** GET clip JSON -> decode data-URL audio -> cache file. Returns path or null. */
  private String downloadClip(String clipUrl) {
    HttpURLConnection conn = null;
    try {
      URL url = new URL(clipUrl);
      conn = (HttpURLConnection) url.openConnection();
      conn.setConnectTimeout(15000);
      conn.setReadTimeout(15000);
      conn.setRequestProperty("Accept", "application/json");
      if (conn.getResponseCode() != 200) return null;
      InputStream in = conn.getInputStream();
      ByteArrayOutputStream bos = new ByteArrayOutputStream();
      byte[] buf = new byte[8192];
      int n, total = 0;
      while ((n = in.read(buf)) != -1) {
        total += n;
        if (total > MAX_CLIP_BYTES) {
          in.close();
          return null;
        }
        bos.write(buf, 0, n);
      }
      in.close();
      // Server shape: { data: { tripId, voiceUrl, senderName, at }, error: null }
      JSONObject root = new JSONObject(bos.toString("UTF-8"));
      JSONObject data = root.optJSONObject("data");
      if (data == null) return null;
      String voiceUrl = data.optString("voiceUrl", null);
      if (voiceUrl == null || !voiceUrl.startsWith("data:")) return null;
      int comma = voiceUrl.indexOf(',');
      if (comma < 0) return null;
      byte[] audio = android.util.Base64.decode(voiceUrl.substring(comma + 1), android.util.Base64.DEFAULT);
      if (audio.length == 0 || audio.length > MAX_CLIP_BYTES) return null;
      File out = new File(getCacheDir(), "voice_" + System.currentTimeMillis() + ".webm");
      FileOutputStream fos = new FileOutputStream(out);
      fos.write(audio);
      fos.close();
      return out.getAbsolutePath();
    } catch (Exception e) {
      Log.w(TAG, "clip download failed: " + e.getMessage());
      return null;
    } finally {
      if (conn != null) conn.disconnect();
    }
  }
}
