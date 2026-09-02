/* ============================================================
   Singhoah — Firebase web-app config (optional Google sign-in)

   Setup (once, in your own Google account):
   1. https://console.firebase.google.com → Add project (any name).
   2. Project settings → "Your apps" → Web (</>) → Register app.
   3. Copy the firebaseConfig values into the object below.
   4. Build → Authentication → Get started → Sign-in method →
      enable "Google".
   5. Authentication → Settings → Authorized domains → add
      maxander08.github.io  (localhost is pre-added for dev).
   6. Rebuild (python3 build.py) and push; the Sign-in button
      appears on all three apps.

   Until real values are pasted here the portal stays completely
   hidden and every app behaves exactly as before.
   ============================================================ */
globalThis.SINGHOAH_FIREBASE = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  appId: "PASTE_YOUR_APP_ID",
};
