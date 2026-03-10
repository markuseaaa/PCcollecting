# Admin setup (secure)

Use Firebase Auth custom claim `admin: true` for real security.
Client-side checks alone are not enough.

## 1) Set admin claim on a user

You need to do this from trusted server/admin context (not browser). Example Node script:

```js
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import serviceAccount from "./serviceAccountKey.json" assert { type: "json" };

initializeApp({ credential: cert(serviceAccount) });

const uid = "PASTE_ADMIN_UID";
await getAuth().setCustomUserClaims(uid, { admin: true });
console.log("Admin claim set");
```

After setting claim, the user should log out and log in again.

## 2) Realtime Database rules (minimum)

Use `auth.token.admin === true` for global admin writes to `items` and cross-user writes.
Adjust to your full ruleset, but keep this principle:

```json
{
  "rules": {
    "items": {
      ".read": "auth != null",
      "$itemId": {
        ".write": "auth != null && auth.token.admin === true"
      }
    },
    "users": {
      "$uid": {
        ".read": "auth != null && ($uid === auth.uid || auth.token.admin === true)",
        ".write": "auth != null && ($uid === auth.uid || auth.token.admin === true)"
      }
    }
  }
}
```

## 3) Storage rules

If admin should moderate/delete files globally, include admin claim in write rule:

```txt
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
  }
}
```

If regular users still need upload rights, split paths and allow writes to own folder only.
