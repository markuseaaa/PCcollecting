import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ref as dbRef, get, update, serverTimestamp } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../../firebase-config";
import {
  buildCollectionCoverImagePath,
  buildResizedPath,
  normalizeImageExtension,
} from "../lib/imagePaths";
import Nav from "../components/Nav";

export default function EditCollectionPage() {
  const { collectionId } = useParams();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [currentCoverImage, setCurrentCoverImage] = useState("");
  const [currentCoverImagePath, setCurrentCoverImagePath] = useState("");
  const [currentCoverThumbPath, setCurrentCoverThumbPath] = useState("");
  const [coverFile, setCoverFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadCollection() {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setError("You must be logged in.");
        setLoading(false);
        return;
      }

      try {
        const snap = await get(dbRef(db, `users/${uid}/collections/${collectionId}`));
        if (!alive) return;

        if (!snap.exists()) {
          setError("Collection not found.");
          setLoading(false);
          return;
        }

        const value = snap.val() || {};
        setTitle(String(value.title || ""));
        setDescription(String(value.description || ""));
        setCurrentCoverImage(String(value.coverImage || ""));
        setCurrentCoverImagePath(String(value.coverImagePath || ""));
        setCurrentCoverThumbPath(String(value.coverThumbPath || ""));
        setVisibility(String(value.visibility || "public"));
      } catch (err) {
        if (!alive) return;
        setError(err?.message || "Could not load collection.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadCollection();
    return () => {
      alive = false;
    };
  }, [collectionId]);

  async function handleSave(e) {
    e.preventDefault();
    setError("");

    const uid = auth.currentUser?.uid;
    if (!uid) return setError("You must be logged in.");
    if (title.trim().length < 2) return setError("Collection title is too short.");

    setSaving(true);
    try {
      let coverImage = currentCoverImage;
      let coverImagePath = currentCoverImagePath;
      let coverThumbPath = currentCoverThumbPath;

      if (coverFile) {
        const ext = normalizeImageExtension(coverFile.name.split(".").pop(), "jpg");
        coverImagePath = buildCollectionCoverImagePath(uid, collectionId, ext);
        coverThumbPath = buildResizedPath(coverImagePath);
        const fileRef = storageRef(storage, coverImagePath);
        await uploadBytes(fileRef, coverFile, { contentType: coverFile.type });
        coverImage = await getDownloadURL(fileRef);
      }

      const updates = {
        [`users/${uid}/collections/${collectionId}/title`]: title.trim(),
        [`users/${uid}/collections/${collectionId}/description`]: description.trim(),
        [`users/${uid}/collections/${collectionId}/coverImage`]: coverImage,
        [`users/${uid}/collections/${collectionId}/coverImagePath`]: coverImagePath,
        [`users/${uid}/collections/${collectionId}/coverThumbPath`]: coverThumbPath,
        [`users/${uid}/collections/${collectionId}/visibility`]: visibility,
        [`users/${uid}/collections/${collectionId}/updatedAt`]: serverTimestamp(),
      };

      await update(dbRef(db), updates);
      navigate(`/users/${uid}/collections/${collectionId}`);
    } catch (err) {
      setError(err?.message || "Could not save collection.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCollection() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    if (
      !window.confirm(
        "Delete this collection? Cards inside it will stay in My Photocards as unassigned."
      )
    ) {
      return;
    }

    setDeleting(true);
    setError("");
    try {
      const [itemIdsSnap, ownedSnap] = await Promise.all([
        get(dbRef(db, `users/${uid}/collections/${collectionId}/itemIds`)),
        get(dbRef(db, `users/${uid}/ownedItems`)),
      ]);
      const updates = {
        [`users/${uid}/collections/${collectionId}`]: null,
      };

      const itemIdsVal = itemIdsSnap.exists() ? itemIdsSnap.val() : {};
      const ownedVal = ownedSnap.exists() ? ownedSnap.val() : {};
      for (const sourceItemId of Object.keys(itemIdsVal || {})) {
        if (String(sourceItemId).startsWith("_")) continue;
        updates[`users/${uid}/ownedItems/${sourceItemId}/collectionId`] = "";
        updates[`users/${uid}/ownedItems/${sourceItemId}/updatedAt`] = serverTimestamp();
      }

      for (const sourceItemId of Object.keys(ownedVal || {})) {
        if (String(sourceItemId).startsWith("_")) continue;
        const value = ownedVal[sourceItemId] || {};
        if (String(value.collectionId || "") === String(collectionId)) {
          updates[`users/${uid}/ownedItems/${sourceItemId}/collectionId`] = "";
          updates[`users/${uid}/ownedItems/${sourceItemId}/updatedAt`] = serverTimestamp();
          updates[`users/${uid}/collections/${collectionId}/itemIds/${sourceItemId}`] = null;
        }
      }

      await update(dbRef(db), updates);
      navigate("/allcollections");
    } catch (err) {
      setError(err?.message || "Could not delete collection.");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <main className="page-content with-nav-space">
        <p className="muted">Loading collection settings...</p>
      </main>
    );
  }

  return (
    <main className="page-content with-nav-space">
      <section className="section-block">
        <h1>Edit collection</h1>
        <p className="muted">Change name, description, cover image, or delete this collection.</p>

        <form className="form-grid" onSubmit={handleSave}>
          <label>
            Collection name
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. TWICE Album PCs"
              required
            />
          </label>

          <label>
            Description
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Korea album pulls only"
            />
          </label>

          <label>
            Visibility
            <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </label>

          <label>
            Replace cover image (optional)
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
            />
          </label>

          {error && <p className="error-text">{error}</p>}

          <button className="btn btn-primary" disabled={saving} type="submit">
            {saving ? "Saving..." : "Save changes"}
          </button>
        </form>

        <div className="center-action">
          <button
            type="button"
            className="btn btn-ghost small danger-btn"
            onClick={handleDeleteCollection}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete collection"}
          </button>
        </div>
      </section>

      <Nav />
    </main>
  );
}
