package com.wandersync.tripapp;

import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge for notification-tap deep link: the app was opened from a voice
 * notification — JS consumes the pending trip+clip once and opens that trip.
 * Also exposes what the native player already finished (replay guard).
 */
@CapacitorPlugin(name = "VoiceWake")
public class VoiceWakePlugin extends Plugin {

  @PluginMethod
  public void getPendingVoiceTrip(PluginCall call) {
    SharedPreferences p = prefs();
    String tripId = p.getString(VoiceFirebaseService.KEY_TRIP, null);
    p.edit().remove(VoiceFirebaseService.KEY_TRIP).apply();
    JSObject ret = new JSObject();
    ret.put("tripId", tripId == null ? "" : tripId);
    call.resolve(ret);
  }

  @PluginMethod
  public void getPendingVoice(PluginCall call) {
    SharedPreferences p = prefs();
    String tripId = p.getString(VoiceFirebaseService.KEY_TRIP, null);
    String clipId = p.getString(VoiceFirebaseService.KEY_CLIP, null);
    p.edit()
      .remove(VoiceFirebaseService.KEY_TRIP)
      .remove(VoiceFirebaseService.KEY_CLIP)
      .apply();
    JSObject ret = new JSObject();
    ret.put("tripId", tripId == null ? "" : tripId);
    ret.put("clipId", clipId == null ? "" : clipId);
    call.resolve(ret);
  }

  @PluginMethod
  public void getLastNativePlayed(PluginCall call) {
    SharedPreferences p = prefs();
    JSObject ret = new JSObject();
    ret.put("clipId", p.getString(VoiceFirebaseService.KEY_LAST_PLAYED, ""));
    ret.put("at", p.getLong(VoiceFirebaseService.KEY_LAST_PLAYED_AT, 0));
    call.resolve(ret);
  }

  private SharedPreferences prefs() {
    return getContext().getSharedPreferences(
      VoiceFirebaseService.PREFS, android.content.Context.MODE_PRIVATE);
  }
}
