import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { auth, db } from "../../firebase-config";
import { ref, child, get, update, remove } from "firebase/database";
import Nav from "../components/Nav";
import backArrow from "../assets/icons/backarrow.svg";

function pickImage(val) {
  if (!val || typeof val !== "object") return "";
  const candidates = [
    val?.images?.cover,
    val?.coverImage,
    val?.imageUrl,
    val?.image,
    val?.thumbnail,
    val?.volumeInfo?.imageLinks?.thumbnail,
    val?.volumeInfo?.imageLinks?.smallThumbnail,
    Array.isArray(val?.images) ? val.images[0] : "",
  ];
  const extract = (x) =>
    typeof x === "string"
      ? x
      : x && typeof x === "object"
      ? x.url || x.src || x.href || x.thumbnail || ""
      : "";
  const u = candidates.map(extract).find((s) => s && s.trim()) || "";
  return u.trim().replace(/^["']|["']$/g, "");
}

export default function EditCategoryPage() {
  const { uid, collectionId, categoryId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [resolvedKey, setResolvedKey] = useState("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        setError("");
        setLoading(true);

        const me = auth.currentUser;
        const myUid = uid || me?.uid;
        if (!myUid) {
          setError("You must be logged in.");
          setLoading(false);
          return;
        }
        const userRoot = `users/${myUid}`;

        const byKeyPath = `${userRoot}/collections/${collectionId}/categories/${categoryId}`;
        const snap = await get(child(ref(db), byKeyPath));
        if (snap.exists()) {
          const val = snap.val() || {};
          if (!mounted.current) return;
          setResolvedKey(categoryId);
          setTitle(String(val.title || "").trim());
          setCoverImage(String(val.coverImage || pickImage(val) || "").trim());
          setLoading(false);
          return;
        }

        const allPath = `${userRoot}/collections/${collectionId}/categories`;
        const allSnap = await get(child(ref(db), allPath));
        if (!allSnap.exists()) {
          setError("Category not found.");
          setLoading(false);
          return;
        }

        const obj = allSnap.val() || {};
        let foundKey = "";
        let foundVal = null;
        for (const [k, v] of Object.entries(obj)) {
          if (!v || typeof v !== "object" || k === "_placeholder") continue;
          const innerId = String(v.id || "").trim();
          if (k === categoryId || innerId === String(categoryId).trim()) {
            foundKey = k;
            foundVal = v;
            break;
          }
        }

        if (!foundKey || !foundVal) {
          setError("Category not found.");
          setLoading(false);
          return;
        }

        if (!mounted.current) return;
        setResolvedKey(foundKey);
        setTitle(String(foundVal.title || "").trim());
        setCoverImage(
          String(foundVal.coverImage || pickImage(foundVal) || "").trim()
        );
        setLoading(false);
      } catch (e) {
        console.error(e);
        if (!mounted.current) return;
        setError("Could not load category.");
        setLoading(false);
      }
    })();

    return () => {
      mounted.current = false;
    };
  }, [uid, collectionId, categoryId]);

  async function handleSave(e) {
    e?.preventDefault?.();
    if (processing || !resolvedKey) return;

    try {
      setError("");
      setProcessing(true);

      const me = auth.currentUser;
      const myUid = uid || me?.uid;
      if (!myUid) throw new Error("Not authenticated.");

      const userRoot = `users/${myUid}`;
      const catRef = child(
        ref(db),
        `${userRoot}/collections/${collectionId}/categories/${resolvedKey}`
      );

      const payload = {
        title: (title || "").trim() || "Untitled",
        coverImage: (coverImage || "").trim(),
        updatedAt: Date.now(),
      };

      await update(catRef, payload);

      navigate(
        `/users/${myUid}/collections/${collectionId}/categories/${resolvedKey}`,
        { replace: true }
      );
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to save changes.");
    } finally {
      setProcessing(false);
    }
  }

  async function handleDelete() {
    if (processing || !resolvedKey) return;

    const confirmTxt = `Do you want to delete this category?\n\n${
      title || "Untitled category"
    }`;
    if (!window.confirm(confirmTxt)) return;

    try {
      setError("");
      setProcessing(true);

      const me = auth.currentUser;
      const myUid = uid || me?.uid;
      if (!myUid) throw new Error("Not authenticated.");

      const userRoot = `users/${myUid}`;
      const catRef = child(
        ref(db),
        `${userRoot}/collections/${collectionId}/categories/${resolvedKey}`
      );

      await remove(catRef);

      navigate(`/users/${myUid}/collections/${collectionId}`, {
        replace: true,
      });
    } catch (e) {
      console.error("Delete failed:", e);
      setError(e?.message || "Failed to delete category.");
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <main className="landing-container">
        <h1 className="page-title">Loading…</h1>
      </main>
    );
  }

  if (error) {
    return (
      <main className="landing-container">
        <h1 className="page-title">Edit category</h1>
        <p className="login-error" style={{ marginTop: 12 }}>
          {error}
        </p>
        <Nav />
      </main>
    );
  }

  return (
    <main style={{ paddingBottom: 130 }}>
      <div>
        <button
          onClick={() => navigate(-1)}
          className="back-arrow-link"
          aria-label="Go back"
        >
          <img src={backArrow} alt="Back" className="back-arrow" />
        </button>
        <h1 className="page-title">Edit category</h1>
      </div>

      <form className="login-form" onSubmit={handleSave} noValidate>
        <div className="login-inputs">
          <p>
            Title <span className="gradient-text">*</span>
          </p>
          <input
            type="text"
            placeholder="Enter a title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          <p>Cover image URL</p>
          <input
            type="url"
            placeholder="https://…"
            value={coverImage}
            onChange={(e) => setCoverImage(e.target.value)}
          />

          {coverImage?.trim() ? (
            <div>
              <p>Preview</p>
              <div className="cover-frame" style={{ width: 180 }}>
                <div className="cover-wrap">
                  <img
                    src={coverImage}
                    alt="Cover preview"
                    className="cover"
                    loading="lazy"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {error && <p className="login-error">{error}</p>}

        <button
          type="button"
          className="login-btn create-btn"
          onClick={handleDelete}
          disabled={processing}
        >
          {processing ? "Deleting…" : "Delete category"}
        </button>

        <div>
          <button
            className="get-started-btn"
            type="submit"
            disabled={processing}
          >
            {processing ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      <Nav />
    </main>
  );
}
