package com.wandersync.tripapp;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.telephony.SmsMessage;

/** Forwards incoming SMS to the SmsReader plugin (works once the app has run). */
public class SmsReceiver extends BroadcastReceiver {

  @Override
  public void onReceive(Context context, Intent intent) {
    if (!"android.provider.Telephony.SMS_RECEIVED".equals(intent.getAction())) return;
    Bundle bundle = intent.getExtras();
    if (bundle == null) return;
    Object[] pdus;
    try {
      pdus = (Object[]) bundle.get("pdus");
    } catch (Exception e) {
      return;
    }
    if (pdus == null) return;
    String format = bundle.getString("format");
    StringBuilder body = new StringBuilder();
    String sender = "";
    for (Object pdu : pdus) {
      try {
        SmsMessage msg = SmsMessage.createFromPdu((byte[]) pdu, format);
        if (msg == null) continue;
        if (sender.isEmpty() && msg.getDisplayOriginatingAddress() != null) {
          sender = msg.getDisplayOriginatingAddress();
        }
        if (msg.getMessageBody() != null) body.append(msg.getMessageBody());
      } catch (Exception ignored) {
      }
    }
    if (body.length() > 0) {
      SmsPlugin.emitSms(sender, body.toString());
    }
  }
}
