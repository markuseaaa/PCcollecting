import { readFile } from "node:fs/promises";
import process from "node:process";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { buildResizedPath, DEFAULT_CARD_THUMB_SIZE } from "../src/lib/imagePaths.js";

const [, , keyPathArg, databaseUrlArg] = process.argv;
const keyPath = keyPathArg || process.env.SERVICE_ACCOUNT_PATH;
const databaseURL = databaseUrlArg || process.env.FIREBASE_DATABASE_URL;

if (!keyPath) {
  console.error("Missing service account path. Usage: node scripts/normalize-thumb-paths.mjs <path/to/serviceAccountKey.json> <databaseURL>");
  process.exit(1);
}

if (!databaseURL) {
  console.error("Missing database URL. Usage: node scripts/normalize-thumb-paths.mjs <path/to/serviceAccountKey.json> <databaseURL>");
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

function normalizeThumbPath(path) {
  const p = String(path || "").trim();
  if (!p) return "";
  const dot = p.lastIndexOf(".");
  if (dot < 0) return `${p}.webp`;
  return `${p.slice(0, dot)}.webp`;
}

function isSystemKey(key) {
  return String(key || "").startsWith("_");
}

const db = getDatabase();
const rootRef = db.ref();
const rootSnap = await rootRef.get();
const rootVal = rootSnap.exists() ? rootSnap.val() : {};
const updates = {};
let changeCount = 0;

function maybeSet(path, currentPath, sourceImagePath = "") {
  const source = String(sourceImagePath || "").trim();
  const next = source
    ? buildResizedPath(source, DEFAULT_CARD_THUMB_SIZE)
    : normalizeThumbPath(currentPath);
  if (!next || next === String(currentPath || "")) return;
  updates[path] = next;
  changeCount += 1;
}

// Global shared items
for (const [itemId, item] of Object.entries(rootVal.items || {})) {
  if (isSystemKey(itemId)) continue;
  maybeSet(`items/${itemId}/thumbPath`, item?.thumbPath || "", item?.imagePath || "");
}

// Per-user collection items + collection covers
for (const [uid, user] of Object.entries(rootVal.users || {})) {
  if (isSystemKey(uid)) continue;

  const collectionItems = user?.collectionItems || {};
  for (const [itemId, item] of Object.entries(collectionItems)) {
    if (isSystemKey(itemId)) continue;
    maybeSet(
      `users/${uid}/collectionItems/${itemId}/thumbPath`,
      item?.thumbPath || "",
      item?.imagePath || ""
    );
  }

  const collections = user?.collections || {};
  for (const [collectionId, collection] of Object.entries(collections)) {
    if (isSystemKey(collectionId)) continue;
    maybeSet(
      `users/${uid}/collections/${collectionId}/coverThumbPath`,
      collection?.coverThumbPath || "",
      collection?.coverImagePath || ""
    );
  }
}

if (!changeCount) {
  console.log("No thumbPath updates needed.");
  process.exit(0);
}

await rootRef.update(updates);
console.log(`Updated ${changeCount} thumbnail path fields to .webp.`);
