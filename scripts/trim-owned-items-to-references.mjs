import { readFile } from "node:fs/promises";
import process from "node:process";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

const [, , keyPathArg, databaseUrlArg] = process.argv;
const keyPath = keyPathArg || process.env.SERVICE_ACCOUNT_PATH;
const databaseURL = databaseUrlArg || process.env.FIREBASE_DATABASE_URL;

if (!keyPath) {
  console.error("Missing service account path. Usage: node scripts/trim-owned-items-to-references.mjs <path/to/serviceAccountKey.json> <databaseURL>");
  process.exit(1);
}

if (!databaseURL) {
  console.error("Missing database URL. Usage: node scripts/trim-owned-items-to-references.mjs <path/to/serviceAccountKey.json> <databaseURL>");
  process.exit(1);
}

const raw = await readFile(keyPath, "utf8");
const serviceAccount = JSON.parse(raw);

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
    databaseURL,
  });
}

const db = getDatabase();
const usersSnap = await db.ref("users").get();
const users = usersSnap.exists() ? usersSnap.val() : {};
const updates = {};
let count = 0;

for (const [uid, userValue] of Object.entries(users || {})) {
  if (String(uid).startsWith("_")) continue;
  const ownedItems = userValue?.ownedItems || {};
  for (const [itemId, value] of Object.entries(ownedItems || {})) {
    if (String(itemId).startsWith("_")) continue;
    const refPath = `users/${uid}/ownedItems/${itemId}`;
    updates[refPath] = {
      itemId: String(value?.itemId || itemId),
      collectionId: String(value?.collectionId || ""),
      createdAt: value?.createdAt || 0,
      updatedAt: value?.updatedAt || value?.createdAt || 0,
    };
    count += 1;
  }
}

if (!count) {
  console.log("No ownedItems found to trim.");
  process.exit(0);
}

await db.ref().update(updates);
console.log(`Trimmed ${count} ownedItems entries to reference-only format.`);
