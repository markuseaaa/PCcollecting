import { readFile } from "node:fs/promises";
import process from "node:process";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { buildItemHashPayload } from "../src/lib/itemHash.js";

const [, , keyPathArg, databaseUrlArg] = process.argv;
const keyPath = keyPathArg || process.env.SERVICE_ACCOUNT_PATH;
const databaseURL = databaseUrlArg || process.env.FIREBASE_DATABASE_URL;

if (!keyPath) {
  console.error("Missing service account path. Usage: node scripts/backfill-item-hashes.mjs <path/to/serviceAccountKey.json> <databaseURL>");
  process.exit(1);
}

if (!databaseURL) {
  console.error("Missing database URL. Usage: node scripts/backfill-item-hashes.mjs <path/to/serviceAccountKey.json> <databaseURL>");
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
const itemsSnap = await db.ref("items").get();
const items = itemsSnap.exists() ? itemsSnap.val() : {};
const updates = {};
let count = 0;

for (const [itemId, item] of Object.entries(items || {})) {
  if (String(itemId).startsWith("_")) continue;
  updates[`itemHashes/${itemId}`] = buildItemHashPayload(item, itemId);
  count += 1;
}

if (!count) {
  console.log("No items found. Nothing to backfill.");
  process.exit(0);
}

await db.ref().update(updates);
console.log(`Backfilled ${count} item hashes.`);
