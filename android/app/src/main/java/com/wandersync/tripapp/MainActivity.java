package com.wandersync.tripapp;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  private static final int MIC_PERMISSION_REQUEST = 7001;
  private static final int NOTIF_PERMISSION_REQUEST = 7002;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(ContactsPlugin.class);
    registerPlugin(SmsPlugin.class);
    registerPlugin(VoiceWakePlugin.class);
    super.onCreate(savedInstanceState);
    stashVoiceTripExtra(getIntent());
    ensureVoiceChannel();

    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MIC_PERMISSION_REQUEST);
    }
    // Android 13+ needs explicit notification permission (voice + missed alerts).
    if (Build.VERSION.SDK_INT >= 33
      && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIF_PERMISSION_REQUEST);
    }

    WebView webView = getBridge().getWebView();
    webView.setWebChromeClient(new WebChromeClient() {
      @Override
      public void onPermissionRequest(PermissionRequest request) {
        runOnUiThread(() -> {
          if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
          } else {
            request.deny();
          }
        });
      }
    });
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    stashVoiceTripExtra(intent);
  }

  /** Voice notification tap carries the trip (+clip) id — stash for the JS bridge.
   *  Accepts our own keys AND raw FCM data keys (system-tray tap delivers the
   *  data payload as launcher-intent extras). */
  private void stashVoiceTripExtra(Intent intent) {
    if (intent == null) return;
    String tripId = intent.getStringExtra(VoiceFirebaseService.EXTRA_TRIP);
    if (tripId == null || tripId.isEmpty()) tripId = intent.getStringExtra("tripId");
    if (tripId == null || tripId.isEmpty()) return;
    String clipId = intent.getStringExtra(VoiceFirebaseService.EXTRA_CLIP);
    if (clipId == null || clipId.isEmpty()) clipId = intent.getStringExtra("clipId");
    VoiceFirebaseService.stashPending(this, tripId, clipId);
  }

  /** LOUD voice channel (heads-up + sound + vibrate) for FCM auto-display. */
  private void ensureVoiceChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    try {
      NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
      if (nm == null || nm.getNotificationChannel(VoiceFirebaseService.CHANNEL_ID) != null) return;
      NotificationChannel ch = new NotificationChannel(
        VoiceFirebaseService.CHANNEL_ID, "Voice messages", NotificationManager.IMPORTANCE_HIGH);
      ch.setDescription("Walkie-talkie voice bursts, even when the app is closed");
      ch.enableVibration(true);
      ch.setVibrationPattern(new long[]{0, 400, 150, 400});
      ch.setSound(
        android.provider.Settings.System.DEFAULT_NOTIFICATION_URI,
        new AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build());
      nm.createNotificationChannel(ch);
    } catch (Exception ignored) { /* channel optional */ }
  }
}
