import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { auth, db } from "../../firebase-config";
import { ref, child, get, update, remove } from "firebase/database";
import Nav from "../components/Nav";
import backArrow from "../assets/icons/backarrow.svg";

export default function EditCollectionPage() {
  const { collectionId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [original, setOriginal] = useState(null);

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        setError("");
        setLoading(true);

        const me = auth.currentUser;
        if (!me) {
          setError("You must be logged in.");
          setLoading(false);
          return;
        }
        const userRoot = `users/${me.uid}`;
        const colSnap = await get(
          child(ref(db), `${userRoot}/collections/${collectionId}`)
        );
        if (!colSnap.exists()) {
          setError("Collection not found.");
          setLoading(false);
          return;
        }
        const data = colSnap.val() || {};
        if (!mounted.current) return;

        setOriginal(data);
        setTitle(String(data.title || "").trim());
        setCoverImage(String(data.coverImage || "").trim());
        setLoading(false);
      } catch (e) {
        console.error(e);
        if (!mounted.current) return;
        setError("Could not load collection.");
        setLoading(false);
      }
    })();

    return () => {
      mounted.current = false;
    };
  }, [collectionId]);

  async function handleSave(e) {
    e?.preventDefault?.();
    if (processing) return;

    try {
      setError("");
      setProcessing(true);

      const me = auth.currentUser;
      if (!me) throw new Error("Not authenticated.");

      const userRoot = `users/${me.uid}`;
      const colRef = child(ref(db), `${userRoot}/collections/${collectionId}`);

      const payload = {
        title: (title || "").trim() || "Untitled",
        coverImage: (coverImage || "").trim(),
        updatedAt: Date.now(),
      };

      await update(colRef, payload);

      navigate(`/users/${me.uid}/collections/${collectionId}`, {
        replace: true,
      });
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to save changes.");
    } finally {
      setProcessing(false);
    }
  }

  async function handleDelete() {
    if (processing) return;

    const confirmTxt = `Do you want to delete this collection?\n\n${
      title || original?.title || "Untitled collection"
    }`;
    if (!window.confirm(confirmTxt)) return;

    try {
      setError("");
      setProcessing(true);

      const me = auth.currentUser;
      if (!me) throw new Error("Not authenticated.");

      const userRoot = `users/${me.uid}`;

      const colRef = child(ref(db), `${userRoot}/collections/${collectionId}`);
      const nestedItemsRef = child(
        ref(db),
        `${userRoot}/collectionItems/${collectionId}`
      );

      const results = await Promise.allSettled([
        remove(colRef),
        remove(nestedItemsRef),
      ]);

      const rejected = results.find((r) => r.status === "rejected");
      if (rejected) {
        const msg =
          rejected.reason?.message ||
          "Failed to delete one or more paths (check Firebase rules).";
        throw new Error(msg);
      }

      navigate("/allcollections", { replace: true });
    } catch (e) {
      console.error("Delete failed:", e);
      setError(e?.message || "Failed to delete collection.");
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
        <h1 className="page-title">Edit collection</h1>
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
        <h1 className="page-title">Edit collection</h1>
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
          {processing ? "Deleting…" : "Delete collection"}
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
