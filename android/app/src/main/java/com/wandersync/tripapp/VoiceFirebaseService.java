package com.wandersync.tripapp;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

/**
 * Closed-app voice wake-up. FCM data messages (kind=voice) arrive even when the
 * app is killed; this service downloads the short-TTL clip and hands it to
 * VoicePlaybackService (foreground, LOUD). No clip URL in FCM (4KB limit) —
 * only the download link. Other kinds are left for the JS layer when open.
 */
public class VoiceFirebaseService extends FirebaseMessagingService {
  static final String TAG = "VoiceFCM";
  static final String CHANNEL_ID = "wandersync_voice";
  static final String PREFS = "wandersync_voice";
  static final String KEY_TRIP = "pending_voice_trip";
  static final String EXTRA_TRIP = "voice_trip_id";
  private static final int MAX_CLIP_BYTES = 8 * 1024 * 1024;

  @Override
  public void onMessageReceived(RemoteMessage msg) {
    Map<String, String> d = msg.getData();
    if (d == null || !"voice".equals(d.get("kind"))) return; // not ours
    String tripId = d.get("tripId");
    String clipUrl = d.get("clipUrl");
    String sender = d.get("senderName");
    if (sender == null || sender.isEmpty()) sender = "Squad";
    if (tripId == null || tripId.isEmpty()) return;
    ensureChannel();
    stashTrip(tripId);
    String file = clipUrl != null ? downloadClip(clipUrl) : null;
    if (file != null) {
      VoicePlaybackService.start(this, file, sender, tripId);
    } else {
      showMissed(tripId, sender); // clip gone/expired — tap opens the trip
    }
  }

  @Override
  public void onNewToken(String token) {
    // Token registration is handled by the Capacitor push plugin + JS layer.
  }

  static void ensureChannel(Context ctx) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
    NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Voice messages", NotificationManager.IMPORTANCE_HIGH);
    ch.setDescription("Walkie-talkie voice bursts, even when the app is closed");
    nm.createNotificationChannel(ch);
  }

  private void ensureChannel() {
    ensureChannel(this);
  }

  private void stashTrip(String tripId) {
    getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_TRIP, tripId).apply();
  }

  static PendingIntent openTripIntent(Context ctx, String tripId) {
    Intent i = new Intent(ctx, MainActivity.class);
    i.putExtra(EXTRA_TRIP, tripId);
    i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    return PendingIntent.getActivity(ctx, tripId.hashCode(), i,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  private void showMissed(String tripId, String sender) {
    try {
      NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_btn_speak_now)
        .setContentTitle(sender + " • voice")
        .setContentText("Tap to open trip & listen")
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setAutoCancel(true)
        .setContentIntent(openTripIntent(this, tripId));
      NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
      if (nm != null) nm.notify((int) (System.currentTimeMillis() % Integer.MAX_VALUE), b.build());
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
        if (total > MAX_CLIP_BYTES) return null;
        bos.write(buf, 0, n);
      }
      in.close();
      String voiceUrl = new JSONObject(bos.toString("UTF-8")).optString("data", null);
      if (voiceUrl == null) voiceUrl = new JSONObject(bos.toString("UTF-8")).optString("voiceUrl", null);
      // Server wraps as { data: {...} } — unwrap once.
      if (voiceUrl == null) {
        try {
          JSONObject data = new JSONObject(bos.toString("UTF-8")).getJSONObject("data");
          voiceUrl = data.optString("voiceUrl", null);
        } catch (Exception ignored) { /* fall through */ }
      }
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
