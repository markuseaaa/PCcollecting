import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ref as dbRef,
  child,
  get,
  push,
  update,
  serverTimestamp,
} from "firebase/database";
import { auth, db } from "../../firebase-config";

/* ---------- helpers ---------- */

function normType(t) {
  const x = (t || "").toLowerCase();
  if (x === "books") return "book";
  if (x === "albums") return "album";
  if (x === "vinyls") return "vinyl";
  return x;
}

const sanitize = (raw) =>
  String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);

function validateName(n) {
  const s = sanitize(n);
  if (!s || s.length < 3)
    return "Navnet skal være mindst 3 tegn (a-z, 0-9 eller _).";
  return null;
}

function validateUrl(u) {
  const re = /^https:\/\/.+\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i;
  return re.test((u || "").trim());
}

/* ---------- component ---------- */
export default function CreateCategory() {
  const { uid: uidFromRoute, collectionId } = useParams();
  const navigate = useNavigate();

  const [colType, setColType] = useState("");
  const [loadingInit, setLoadingInit] = useState(true);
  const [initErr, setInitErr] = useState("");

  const [name, setName] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [imgOk, setImgOk] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setInitErr("");
        setLoadingInit(true);

        const me = auth.currentUser;
        const uid = uidFromRoute || me?.uid;
        if (!uid) {
          if (alive) {
            setInitErr("You must be logged in.");
            setLoadingInit(false);
          }
          return;
        }

        const colSnap = await get(
          child(dbRef(db), `users/${uid}/collections/${collectionId}`)
        );
        if (!colSnap.exists()) {
          if (alive) {
            setInitErr("Collection not found.");
            setLoadingInit(false);
          }
          return;
        }
        const col = colSnap.val() || {};
        const t = normType(col?.type) || "";

        let derivedType = t;

        if (!derivedType) {
          try {
            const itemsSnap = await get(
              child(dbRef(db), `users/${uid}/collectionItems/${collectionId}`)
            );
            if (itemsSnap.exists()) {
              const obj = itemsSnap.val() || {};
              for (const k of Object.keys(obj)) {
                if (k === "_placeholder") continue;
                const it = obj[k];
                if (it?.type) {
                  derivedType = normType(it.type);
                  break;
                }
              }
            }
          } catch {
            // ignore
          }
        }

        if (!alive) return;
        setColType(derivedType);
        setLoadingInit(false);
      } catch (err) {
        if (!alive) return;
        console.error("CreateCategory init error:", err);
        setInitErr(err?.message || "Kunne ikke hente collection.");
        setLoadingInit(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [uidFromRoute, collectionId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const v = validateName(name);
    if (v) return setError(v);

    if (coverUrl && !validateUrl(coverUrl)) {
      return setError(
        "Indsæt en gyldig HTTPS billed-URL (jpg/png/webp/gif/svg) eller lad feltet være tomt."
      );
    }
    if (imgOk === false) {
      return setError("Billedet kunne ikke indlæses. Tjek URL’en.");
    }

    const me = auth.currentUser;
    const uid = uidFromRoute || me?.uid;
    if (!uid)
      return setError("Du skal være logget ind for at oprette en kategori.");

    setSaving(true);
    try {
      const now = serverTimestamp();
      const titleSan = sanitize(name);

      console.log("[CreateCategory] write →", {
        uid,
        collectionId,
        path: `users/${uid}/collections/${collectionId}/categories`,
      });

      const newRef = push(
        dbRef(db, `users/${uid}/collections/${collectionId}/categories`)
      );
      const categoryId = newRef.key;

      const updates = {};

      updates[
        `users/${uid}/collections/${collectionId}/categories/${categoryId}/id`
      ] = categoryId;
      updates[
        `users/${uid}/collections/${collectionId}/categories/${categoryId}/title`
      ] = titleSan;
      if (coverUrl) {
        updates[
          `users/${uid}/collections/${collectionId}/categories/${categoryId}/coverImage`
        ] = coverUrl.trim();
      }
      if (colType) {
        updates[
          `users/${uid}/collections/${collectionId}/categories/${categoryId}/type`
        ] = colType;
      }
      updates[
        `users/${uid}/collections/${collectionId}/categories/${categoryId}/createdAt`
      ] = now;
      updates[
        `users/${uid}/collections/${collectionId}/categories/${categoryId}/updatedAt`
      ] = now;

      updates[
        `users/${uid}/collections/${collectionId}/categories/_placeholder`
      ] = true;

      await update(dbRef(db), updates);

      setName("");
      setCoverUrl("");
      setImgOk(null);

      navigate(`/users/${uid}/collections/${collectionId}`);
    } catch (err) {
      console.error("CreateCategory error:", err);
      setError(err?.message || "Noget gik galt ved oprettelsen.");
    } finally {
      setSaving(false);
    }
  }

  if (loadingInit) {
    return (
      <main className="landing-container">
        <h1 className="page-title">Loading…</h1>
      </main>
    );
  }
  if (initErr) {
    return (
      <main className="landing-container">
        <h1 className="page-title">{initErr}</h1>
      </main>
    );
  }

  return (
    <main style={{ paddingBottom: 130 }}>
      <div>
        <h1 className="page-title">New category</h1>
        {colType ? (
          <p
            className="aftersignup-subtitle"
            style={{ fontSize: 16, opacity: 0.8 }}
          >
            Type:{" "}
            {colType === "book"
              ? "Books"
              : colType === "album"
              ? "Albums"
              : colType === "vinyl"
              ? "Vinyl"
              : colType}
          </p>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="login-inputs login-form">
          <p>Category name</p>
          <input
            type="text"
            placeholder="Enter name of category"
            value={name}
            onChange={(e) => setName(e.target.value)}
            pattern="^[a-z0-9_]{3,20}$"
            required
          />

          <label className="cover-image-label">
            Add cover image (paste URL)
          </label>
          <input
            type="url"
            placeholder="https://example.com/cover.jpg"
            value={coverUrl}
            onChange={(e) => {
              setCoverUrl(e.target.value);
              setImgOk(null);
            }}
            onBlur={(e) => {
              if (e.target.value && !validateUrl(e.target.value))
                setImgOk(false);
            }}
          />

          {coverUrl ? (
            <div>
              <p>Preview:</p>
              <img
                src={coverUrl}
                alt="cover preview"
                onLoad={() => setImgOk(true)}
                onError={() => setImgOk(false)}
                style={{ maxWidth: 240, borderRadius: 8 }}
              />
              {imgOk === false && (
                <small style={{ color: "salmon" }}>
                  Billedet kunne ikke indlæses – tjek URL’en eller filendelsen.
                </small>
              )}
            </div>
          ) : null}
        </div>

        <div>
          <button
            className="get-started-btn create-collection-btn"
            type="submit"
            disabled={saving || imgOk === false}
            aria-label="Create category"
          >
            {saving ? "Opretter…" : "Create category"}
          </button>
        </div>

        {error && (
          <div style={{ color: "salmon", textAlign: "center", marginTop: 8 }}>
            {error}
          </div>
        )}
      </form>
    </main>
  );
}
