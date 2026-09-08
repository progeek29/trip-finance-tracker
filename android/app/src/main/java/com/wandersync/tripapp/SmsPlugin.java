package com.wandersync.tripapp;

import android.Manifest;
import android.content.pm.PackageManager;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Bank SMS auto-log bridge. The manifest-declared SmsReceiver forwards every
 * incoming SMS here; JS filters debit messages with the existing regex parser.
 */
@CapacitorPlugin(
  name = "SmsReader",
  permissions = {
    @Permission(strings = { Manifest.permission.RECEIVE_SMS }, alias = "receive"),
    @Permission(strings = { Manifest.permission.READ_SMS }, alias = "read")
  }
)
public class SmsPlugin extends Plugin {

  private static SmsPlugin instance;

  @Override
  public void load() {
    instance = this;
  }

  public static void emitSms(String sender, String body) {
    if (instance != null) {
      JSObject data = new JSObject();
      data.put("sender", sender == null ? "" : sender);
      data.put("body", body == null ? "" : body);
      instance.notifyListeners("smsReceived", data);
    }
  }

  private boolean hasSmsPermission() {
    return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECEIVE_SMS)
        == PackageManager.PERMISSION_GRANTED
      && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_SMS)
        == PackageManager.PERMISSION_GRANTED;
  }

  @PluginMethod
  public void requestSmsPermission(PluginCall call) {
    if (hasSmsPermission()) {
      JSObject ret = new JSObject();
      ret.put("granted", true);
      call.resolve(ret);
      return;
    }
    requestPermissionForAliases(new String[]{"receive", "read"}, call, "smsPermCallback");
  }

  @PermissionCallback
  private void smsPermCallback(PluginCall call) {
    JSObject ret = new JSObject();
    ret.put("granted", hasSmsPermission());
    call.resolve(ret);
  }
}
