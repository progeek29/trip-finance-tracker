# WanderSync — Mobile Phone Testing & Android APK Guide

This guide explains:
1. **How to use the live web app on Android and iPhone**
2. **How the Android `.apk` automatically reads debited SMS in the background**
3. **Step-by-step commands to build the native Android `.apk`**

---

## 📱 1. How to Test Live on Your Phone Right Now

For production testing, use the public app URL:

👉 **`https://trip-finance-tracker.vercel.app`**

The older LAN URL below is only for local development:

1. Ensure your mobile phone is connected to the **same Wi-Fi network** as this computer.
2. Open this URL in Chrome or Safari and log in.
3. On iPhone Safari, tap **Share → Add to Home Screen** to get an app-like icon.
4. On Android Chrome, use the browser menu and choose **Install app** or **Add to Home screen** when offered.

The Google Play listing is not live yet. Until then, use the debug APK described below.

---

## 🤖 2. How Android APK Background SMS Auto-Logging Works

### The Web vs. Native Difference:
- **In Web Browsers (Chrome/Safari)**: For security reasons, browsers cannot read your private inbox SMS in the background. That is why web apps provide a quick paste/simulation option.
- **In the Android Native `.apk`**: Android allows apps with `RECEIVE_SMS` permission to register a background `BroadcastReceiver`.

### Native Android Architecture:
```
[ Incoming Bank Debit SMS ] (e.g. HDFC/SBI/ICICI)
           │
           ▼
[ Android OS: Telephony.Sms.Intents.SMS_RECEIVED_ACTION ]
           │
           ▼
[ WanderSync Native SMS BroadcastReceiver ]
   - Checks if trip is currently active (e.g. Sep 20–25)
   - Runs Regex Parser (extracts Merchant, Amount, Category)
           │
           ▼
[ Local SQLite / Capacitor Storage Sync ]
   - Updates Trip Expense Ledger in real-time
   - Fires a heads-up notification: 
     "💸 ₹850 debited at Burger Factory Goa - Auto-logged to Food!"
```

---

## 🛠️ 3. Step-by-Step Commands to Generate the Android APK

We use **Capacitor.js** (the official, open-source mobile runtime for React/Vite apps):

### Step 1: Install Capacitor Dependencies
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
```

### Step 2: Initialize Capacitor Config
```bash
npx cap init WanderSync com.wandersync.tripapp --web-dir dist
```

### Step 3: Build the Web Assets for the live backend
```bash
$env:VITE_API_URL = "https://wandersync-app.duckdns.org/api"
$env:VITE_SOCKET_URL = "https://wandersync-app.duckdns.org"
npm run build
npx cap sync android
```

### Step 4: Add SMS Permissions in `AndroidManifest.xml`
In `android/app/src/main/AndroidManifest.xml`, add:
```xml
<uses-permission android:name="android.permission.RECEIVE_SMS" />
<uses-permission android:name="android.permission.READ_SMS" />
<uses-permission android:name="android.permission.INTERNET" />
```

### Step 5: Open in Android Studio & Build APK
```bash
npx cap open android
```
- In Android Studio, click **Build $\rightarrow$ Build Bundle(s) / APK(s) $\rightarrow$ Build APK(s)**.
- Transfer `app-debug.apk` directly to your phone via USB or WhatsApp/Drive to install!

The current debug artifact is generated at:

`android/app/build/outputs/apk/debug/app-debug.apk`

The current release build uses Android version `1.2` and version code `3`.
