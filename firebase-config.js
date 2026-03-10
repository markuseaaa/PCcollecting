/* eslint-disable no-empty */
import { initializeApp } from "firebase/app";
import {
  getDatabase,
  connectDatabaseEmulator,
  ref,
  get,
  child,
} from "firebase/database";
import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInAnonymously,
  GoogleAuthProvider,
  connectAuthEmulator,
} from "firebase/auth";
import { getStorage, connectStorageEmulator } from "firebase/storage";

// ⚙️ ENV (Vite)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// 🔥 Init
const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// 🧷 Persistence (bevar login over reload)
setPersistence(auth, browserLocalPersistence).catch((err) => {
  // Safari Private osv.
  console.warn("Kunne ikke sætte persistence:", err?.message || err);
});

// 🧪 Emulators (kun når du kører på localhost)
if (typeof window !== "undefined" && location.hostname === "localhost") {
  try {
    connectAuthEmulator(auth, "http://127.0.0.1:9099");
    connectDatabaseEmulator(db, "127.0.0.1", 9000);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
  } catch (err) {
    console.warn(
      "Kunne ikke forbinde til Firebase emulatorer:",
      err?.message || err
    );
  }
}

// 📈 Analytics (valgfrit)
let analytics = null;
if (
  typeof window !== "undefined" &&
  /^https?:/.test(window.location.protocol)
) {
  import("firebase/analytics")
    .then(({ getAnalytics }) => {
      try {
        analytics = getAnalytics(app);
      } catch (err) {
        console.warn("Analytics slået fra:", err?.message || err);
      }
    })
    .catch((err) => {
      console.warn("Kunne ikke loade analytics:", err?.message || err);
    });
}
export { analytics };

/**
 * ✅ ensureAnonAuth(options)
 * - Venter på første onAuthStateChanged så Firebase kan genskabe en eksisterende session
 * - Hvis der stadig ikke er bruger efter timeout: kan (valgfrit) logge anonymt ind
 * - Returnerer en Promise<User|null>
 * - Kald med { allowGuest:false } på sider der kræver *rigtig* login
 */
let _authReadyPromise = null;

export function ensureAnonAuth({ allowGuest = true, timeoutMs = 2000 } = {}) {
  if (_authReadyPromise) return _authReadyPromise;

  _authReadyPromise = new Promise((resolve) => {
    // Hvis en session allerede findes (fx navigation), brug den
    if (auth.currentUser) return resolve(auth.currentUser);

    let settled = false;

    // 1) Vent på første auth-event (Firebase genskaber persist. bruger her)
    const unsub = onAuthStateChanged(auth, (u) => {
      if (settled) return;
      if (u) {
        settled = true;
        try {
          unsub();
        } catch {}
        return resolve(u);
      }
      // Ikke anonym-login her! Vi venter til timeout.
    });

    // 2) Efter en kort ventetid: hvis stadig ingen bruger, kan vi (valgfrit) logge anonymt ind
    const t = setTimeout(async () => {
      if (settled) return;
      try {
        unsub();
      } catch {}
      if (allowGuest) {
        try {
          const cred = await signInAnonymously(auth);
          settled = true;
          return resolve(cred.user);
        } catch (err) {
          console.warn(
            "Anonym login fejlede:",
            err?.code || err?.message || err
          );
        }
      }
      // Offentlig tilstand uden bruger
      settled = true;
      resolve(null);
    }, timeoutMs);

    // Oprydning
    window?.addEventListener?.("beforeunload", () => {
      try {
        clearTimeout(t);
      } catch {}
      try {
        unsub();
      } catch {}
    });
  });

  return _authReadyPromise;
}

// 🔎 Hjælpere
export const getCurrentUid = () => auth.currentUser?.uid || null;
export const hasUser = () => !!auth.currentUser;

/**
 * (Valgfrit) Helper til at tjekke om en given sti findes (brugbar i debug)
 * await pathExists(`users/${auth.currentUser.uid}/collections/${collectionId}`)
 */
export async function pathExists(path) {
  try {
    const s = await get(child(ref(db), path));
    return s.exists();
  } catch (e) {
    console.warn("pathExists fejlede:", e?.message || e);
    return false;
  }
}
