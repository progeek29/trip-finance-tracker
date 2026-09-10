package com.wandersync.tripapp;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import java.io.File;

/**
 * Foreground playback of a downloaded voice burst (closed-app PTT receive path).
 * mediaPlayback type — no microphone use here (transmit stays foreground-only).
 * Persistent notification with Stop + tap-to-open-trip; self-stops after play.
 */
public class VoicePlaybackService extends Service {
  static final String TAG = "VoicePlay";
  static final String ACTION_START = "com.wandersync.tripapp.VOICE_START";
  static final String ACTION_STOP = "com.wandersync.tripapp.VOICE_STOP";
  static final String EXTRA_FILE = "file";
  static final String EXTRA_SENDER = "sender";
  static final String EXTRA_TRIP = "trip";
  private static final int NOTIF_ID = 9001;

  private MediaPlayer player = null;
  private PowerManager.WakeLock wakeLock = null;
  private String clipFile = null;

  static void start(Context ctx, String file, String sender, String tripId) {
    try {
      Intent i = new Intent(ctx, VoicePlaybackService.class);
      i.setAction(ACTION_START);
      i.putExtra(EXTRA_FILE, file);
      i.putExtra(EXTRA_SENDER, sender);
      i.putExtra(EXTRA_TRIP, tripId);
      ContextCompat.startForegroundService(ctx, i);
    } catch (Exception e) {
      Log.w(TAG, "start failed: " + e.getMessage());
    }
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    if (intent != null && ACTION_STOP.equals(intent.getAction())) {
      cleanup();
      stopSelf();
      return START_NOT_STICKY;
    }
    if (intent == null || !ACTION_START.equals(intent.getAction())) return START_NOT_STICKY;
    clipFile = intent.getStringExtra(EXTRA_FILE);
    String sender = intent.getStringExtra(EXTRA_SENDER);
    String tripId = intent.getStringExtra(EXTRA_TRIP);
    if (sender == null) sender = "Squad";
    if (clipFile == null) {
      stopSelf();
      return START_NOT_STICKY;
    }
    try {
      VoiceFirebaseService.ensureChannel(this);
      Notification notif = buildNotif(sender, tripId);
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
      } else {
        startForeground(NOTIF_ID, notif);
      }
      PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
      if (pm != null) {
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "WanderSync:voice");
        wakeLock.acquire(60 * 1000L);
      }
      vibrate();
      player = new MediaPlayer();
      player.setAudioAttributes(new AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build());
      player.setDataSource(clipFile);
      player.setVolume(1.0f, 1.0f);
      player.setOnCompletionListener((mp) -> {
        cleanup();
        stopSelf();
      });
      player.setOnErrorListener((mp, what, extra) -> {
        cleanup();
        stopSelf();
        return true;
      });
      player.prepare();
      player.start();
    } catch (Exception e) {
      Log.w(TAG, "play failed: " + e.getMessage());
      cleanup();
      stopSelf();
    }
    return START_NOT_STICKY;
  }

  private Notification buildNotif(String sender, String tripId) {
    PendingIntent stop = PendingIntent.getService(this, 1,
      new Intent(this, VoicePlaybackService.class).setAction(ACTION_STOP),
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    NotificationCompat.Builder b = new NotificationCompat.Builder(this, VoiceFirebaseService.CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentTitle(sender + " • voice")
      .setContentText("Playing walkie-talkie burst")
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setOngoing(true)
      .addAction(android.R.drawable.ic_media_pause, "Stop", stop);
    if (tripId != null) b.setContentIntent(VoiceFirebaseService.openTripIntent(this, tripId));
    return b.build();
  }

  private void vibrate() {
    try {
      Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
      if (v == null || !v.hasVibrator()) return;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        v.vibrate(VibrationEffect.createWaveform(new long[]{0, 400, 150, 400}, -1));
      } else {
        v.vibrate(new long[]{0, 400, 150, 400}, -1);
      }
    } catch (Exception ignored) { /* no vibrator */ }
  }

  private void cleanup() {
    try {
      if (player != null) {
        try { if (player.isPlaying()) player.stop(); } catch (Exception ignored) { /* done */ }
        player.release();
        player = null;
      }
    } catch (Exception ignored) { /* done */ }
    try {
      if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
      wakeLock = null;
    } catch (Exception ignored) { /* done */ }
    try {
      NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
      if (nm != null) nm.cancel(NOTIF_ID);
    } catch (Exception ignored) { /* done */ }
    try {
      if (clipFile != null) new File(clipFile).delete();
      clipFile = null;
    } catch (Exception ignored) { /* done */ }
  }

  @Override
  public void onDestroy() {
    cleanup();
    super.onDestroy();
  }
}
