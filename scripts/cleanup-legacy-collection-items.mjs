import { readFile } from "node:fs/promises";
import process from "node:process";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { resolveSourceItemId } from "../src/lib/ownership.js";

const [, , keyPathArg, databaseUrlArg] = process.argv;
const keyPath = keyPathArg || process.env.SERVICE_ACCOUNT_PATH;
const databaseURL = databaseUrlArg || process.env.FIREBASE_DATABASE_URL;

if (!keyPath) {
  console.error("Missing service account path. Usage: node scripts/cleanup-legacy-collection-items.mjs <path/to/serviceAccountKey.json> <databaseURL>");
  process.exit(1);
}

if (!databaseURL) {
  console.error("Missing database URL. Usage: node scripts/cleanup-legacy-collection-items.mjs <path/to/serviceAccountKey.json> <databaseURL>");
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
let removed = 0;
let skipped = 0;

for (const [uid, userValue] of Object.entries(users || {})) {
  if (String(uid).startsWith("_")) continue;
  const ownedItems = userValue?.ownedItems || {};
  const collectionItems = userValue?.collectionItems || {};

  for (const [userItemId, userItem] of Object.entries(collectionItems || {})) {
    if (String(userItemId).startsWith("_")) continue;
    const sourceItemId = resolveSourceItemId(userItem, userItemId);
    if (!sourceItemId) {
      skipped += 1;
      continue;
    }
    if (!ownedItems?.[sourceItemId]) {
      skipped += 1;
      continue;
    }
    updates[`users/${uid}/collectionItems/${userItemId}`] = null;
    removed += 1;
  }

  updates[`users/${uid}/collectionItems/_placeholder`] = true;
}

if (!removed) {
  console.log(`No legacy collectionItems removed. Skipped ${skipped}.`);
  process.exit(0);
}

await db.ref().update(updates);
console.log(`Removed ${removed} legacy collectionItems entries. Skipped ${skipped}.`);
