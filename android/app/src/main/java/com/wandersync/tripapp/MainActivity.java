package com.wandersync.tripapp;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
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

  /** Voice notification tap carries the trip id — stash for the JS bridge. */
  private void stashVoiceTripExtra(Intent intent) {
    if (intent == null || !intent.hasExtra(VoiceFirebaseService.EXTRA_TRIP)) return;
    String tripId = intent.getStringExtra(VoiceFirebaseService.EXTRA_TRIP);
    if (tripId == null || tripId.isEmpty()) return;
    getSharedPreferences(VoiceFirebaseService.PREFS, MODE_PRIVATE)
      .edit().putString(VoiceFirebaseService.KEY_TRIP, tripId).apply();
  }
}
