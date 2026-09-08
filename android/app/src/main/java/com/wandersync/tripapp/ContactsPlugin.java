package com.wandersync.tripapp;

import android.Manifest;
import android.content.ContentResolver;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.ContactsContract;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.HashSet;

/** Phone contacts reader (name + number) with runtime permission. */
@CapacitorPlugin(
  name = "Contacts",
  permissions = {
    @Permission(strings = { Manifest.permission.READ_CONTACTS }, alias = "contacts")
  }
)
public class ContactsPlugin extends Plugin {

  private boolean hasContactsPermission() {
    return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CONTACTS)
      == PackageManager.PERMISSION_GRANTED;
  }

  @PluginMethod
  public void getContacts(PluginCall call) {
    if (!hasContactsPermission()) {
      requestPermissionForAlias("contacts", call, "contactsPermCallback");
      return;
    }
    fetchContacts(call);
  }

  @PermissionCallback
  private void contactsPermCallback(PluginCall call) {
    if (hasContactsPermission()) {
      fetchContacts(call);
    } else {
      call.reject("Contacts permission denied");
    }
  }

  private void fetchContacts(PluginCall call) {
    try {
      ContentResolver cr = getContext().getContentResolver();
      JSArray list = new JSArray();
      HashSet<String> seen = new HashSet<>();
      Cursor cur = cr.query(
        ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
        new String[]{
          ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
          ContactsContract.CommonDataKinds.Phone.NUMBER
        },
        null, null,
        ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC");
      if (cur != null) {
        int nameIdx = cur.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
        int numIdx = cur.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
        int count = 0;
        while (cur.moveToNext() && count < 2000) {
          String name = cur.getString(nameIdx);
          String number = cur.getString(numIdx);
          if (name == null || number == null) continue;
          number = number.replaceAll("[^+0-9]", "");
          if (number.length() < 7) continue;
          String key = name + "|" + number;
          if (seen.contains(key)) continue;
          seen.add(key);
          JSObject o = new JSObject();
          o.put("name", name);
          o.put("phone", number);
          list.put(o);
          count++;
        }
        cur.close();
      }
      JSObject ret = new JSObject();
      ret.put("contacts", list);
      call.resolve(ret);
    } catch (Exception e) {
      call.reject("Failed to read contacts", e);
    }
  }
}
