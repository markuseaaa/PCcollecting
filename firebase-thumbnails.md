# Firebase thumbnail setup (Resize Images)

This project stores original photocard images and reads resized thumbnails for list/grid views.

## 1) Install extension in Firebase Console

1. Open Firebase Console -> your project `pccollecting-7dfc3`.
2. Go to `Extensions` -> `Explore Extensions`.
3. Find `Resize Images` (`firebase/storage-resize-images`) and click `Install`.

## 2) Recommended install values

Use these values unless you already have a policy:

- `Cloud Functions location`: same region as your DB/Storage (for your DB URL this is `europe-west1`).
- `Storage bucket`: default bucket for this project.
- `Resized images dimensions`: `300x400`.
- `Image types to convert`: `image/jpeg,image/png,image/webp`.
- `Delete original file`: `No`.
- `Make resized images public`: `No`.
- `Cache-Control header for resized images`: `public,max-age=31536000`.

Why: grid/list cards use 3:4 ratio; keeping original allows detail page quality.

## 3) Storage rules

Use authenticated-only access while developing:

```txt
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 4) Realtime Database rules

Use authenticated-only access while developing:

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

## 5) App .env values

Create `.env` from `.env.example` and fill all keys. `VITE_FIREBASE_DATABASE_URL` must be set.

For this project database URL:

`https://pccollecting-7dfc3-default-rtdb.europe-west1.firebasedatabase.app/`

## 6) How code expects resized files

When uploading an original file like:

`users/<uid>/photocards/<itemId>.jpg`

the app expects the resized thumbnail path:

`users/<uid>/photocards/<itemId>_300x400.jpg`

That matches the Resize Images extension naming convention.

## 7) Verify quickly

1. Run `npm run dev`.
2. Upload one photocard on `/submit`.
3. In Storage, confirm both original and `_300x400` file exist.
4. Open dashboard/collection and verify cards load from thumbnails.
