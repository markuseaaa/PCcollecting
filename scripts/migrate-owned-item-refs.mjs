import { readFile } from "node:fs/promises";
import process from "node:process";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { resolveSourceItemId } from "../src/lib/ownership.js";

const [, , keyPathArg, databaseUrlArg] = process.argv;
const keyPath = keyPathArg || process.env.SERVICE_ACCOUNT_PATH;
const databaseURL = databaseUrlArg || process.env.FIREBASE_DATABASE_URL;

if (!keyPath) {
  console.error("Missing service account path. Usage: node scripts/migrate-owned-item-refs.mjs <path/to/serviceAccountKey.json> <databaseURL>");
  process.exit(1);
}

if (!databaseURL) {
  console.error("Missing database URL. Usage: node scripts/migrate-owned-item-refs.mjs <path/to/serviceAccountKey.json> <databaseURL>");
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
let refCount = 0;

for (const [uid, userValue] of Object.entries(users || {})) {
  if (String(uid).startsWith("_")) continue;
  const collectionItems = userValue?.collectionItems || {};

  for (const [userItemId, userItem] of Object.entries(collectionItems)) {
    if (String(userItemId).startsWith("_")) continue;
    const sourceItemId = resolveSourceItemId(userItem, userItemId);
    if (!sourceItemId) continue;
    const collectionId = String(userItem?.collectionId || "").trim();

    const base = `users/${uid}/ownedItems/${sourceItemId}`;
    updates[`${base}/itemId`] = sourceItemId;
    updates[`${base}/collectionId`] = collectionId;
    updates[`${base}/title`] = userItem?.title || "";
    updates[`${base}/group`] = userItem?.group || "";
    updates[`${base}/member`] = userItem?.member || "";
    updates[`${base}/album`] = userItem?.album || "";
    updates[`${base}/rarity`] = userItem?.rarity || "";
    updates[`${base}/version`] = userItem?.version || "";
    updates[`${base}/sourceName`] = userItem?.sourceName || "";
    updates[`${base}/pobStore`] = userItem?.pobStore || "";
    updates[`${base}/otherType`] = userItem?.otherType || "";
    updates[`${base}/thumbPath`] = userItem?.thumbPath || "";
    updates[`${base}/imagePath`] = userItem?.imagePath || "";
    updates[`${base}/imageUrl`] = userItem?.imageUrl || "";
    updates[`${base}/createdAt`] = userItem?.createdAt || 0;
    updates[`${base}/updatedAt`] = userItem?.updatedAt || userItem?.createdAt || 0;

    if (collectionId) {
      updates[`users/${uid}/collections/${collectionId}/itemIds/${sourceItemId}`] = true;
    }
    refCount += 1;
  }
}

if (!refCount) {
  console.log("No collectionItems found. Nothing to migrate.");
  process.exit(0);
}

await db.ref().update(updates);
console.log(`Migrated ${refCount} owned item references.`);
