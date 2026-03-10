import { useState } from "react";
import { useNavigate } from "react-router";
import { ref as dbRef, push, update, serverTimestamp } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../../firebase-config";
import { buildResizedPath } from "../lib/imagePaths";
import Nav from "../components/Nav";

export default function CreateCollection() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverFile, setCoverFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const uid = auth.currentUser?.uid;
    if (!uid) return setError("You must be logged in.");
    if (title.trim().length < 2) return setError("Collection title is too short.");

    setLoading(true);
    try {
      const collectionRef = push(dbRef(db, `users/${uid}/collections`));
      const collectionId = collectionRef.key;
      const now = serverTimestamp();

      let coverImage = "";
      let coverImagePath = "";
      let coverThumbPath = "";
      if (coverFile) {
        const ext = coverFile.name.split(".").pop()?.toLowerCase() || "jpg";
        coverImagePath = `users/${uid}/collections/${collectionId}/cover.${ext}`;
        coverThumbPath = buildResizedPath(coverImagePath);
        const fileRef = storageRef(storage, coverImagePath);
        await uploadBytes(fileRef, coverFile, { contentType: coverFile.type });
        coverImage = await getDownloadURL(fileRef);
      }

      const updates = {};
      updates[`users/${uid}/collections/${collectionId}/id`] = collectionId;
      updates[`users/${uid}/collections/${collectionId}/title`] = title.trim();
      updates[`users/${uid}/collections/${collectionId}/description`] =
        description.trim();
      updates[`users/${uid}/collections/${collectionId}/coverImage`] = coverImage;
      updates[`users/${uid}/collections/${collectionId}/coverImagePath`] =
        coverImagePath;
      updates[`users/${uid}/collections/${collectionId}/coverThumbPath`] =
        coverThumbPath;
      updates[`users/${uid}/collections/${collectionId}/createdAt`] = now;
      updates[`users/${uid}/collections/${collectionId}/updatedAt`] = now;

      await update(dbRef(db), updates);
      navigate(`/users/${uid}/collections/${collectionId}`);
    } catch (err) {
      setError(err?.message || "Could not create collection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-content with-nav-space">
      <section className="section-block">
        <h1>Create collection</h1>
        <p className="muted">Create a binder for one group, album, or member focus.</p>

        <form className="form-grid" onSubmit={handleSubmit}>
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
            Cover image (optional)
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
            />
          </label>

          {error && <p className="error-text">{error}</p>}

          <button className="btn btn-primary" disabled={loading} type="submit">
            {loading ? "Creating..." : "Create collection"}
          </button>
        </form>
      </section>

      <Nav />
    </main>
  );
}
