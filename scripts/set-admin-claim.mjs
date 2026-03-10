import { readFile } from "node:fs/promises";
import process from "node:process";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const [, , uidArg, keyPathArg] = process.argv;
const uid = uidArg || process.env.ADMIN_UID;
const keyPath = keyPathArg || process.env.SERVICE_ACCOUNT_PATH;

if (!uid) {
  console.error("Missing UID. Usage: node scripts/set-admin-claim.mjs <UID> <path/to/serviceAccountKey.json>");
  process.exit(1);
}

if (!keyPath) {
  console.error("Missing service account path. Usage: node scripts/set-admin-claim.mjs <UID> <path/to/serviceAccountKey.json>");
  process.exit(1);
}

const raw = await readFile(keyPath, "utf8");
const serviceAccount = JSON.parse(raw);

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}

await getAuth().setCustomUserClaims(uid, { admin: true });
console.log(`Admin claim set for UID: ${uid}`);
console.log("User must log out and log in again.");
