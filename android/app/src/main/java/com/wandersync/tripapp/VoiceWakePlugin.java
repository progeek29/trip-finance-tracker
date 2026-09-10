package com.wandersync.tripapp;

import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge for notification-tap deep link: the app was opened from a voice
 * notification — JS consumes the pending trip id once and opens that trip.
 */
@CapacitorPlugin(name = "VoiceWake")
public class VoiceWakePlugin extends Plugin {

  @PluginMethod
  public void getPendingVoiceTrip(PluginCall call) {
    SharedPreferences p = getContext().getSharedPreferences(
      VoiceFirebaseService.PREFS, android.content.Context.MODE_PRIVATE);
    String tripId = p.getString(VoiceFirebaseService.KEY_TRIP, null);
    p.edit().remove(VoiceFirebaseService.KEY_TRIP).apply();
    JSObject ret = new JSObject();
    ret.put("tripId", tripId == null ? "" : tripId);
    call.resolve(ret);
  }
}
