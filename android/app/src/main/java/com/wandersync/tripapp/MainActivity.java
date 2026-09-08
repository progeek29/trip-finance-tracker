package com.wandersync.tripapp;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(ContactsPlugin.class);
    registerPlugin(SmsPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
