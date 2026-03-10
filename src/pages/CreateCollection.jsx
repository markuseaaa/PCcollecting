import { useState } from "react";
import { useNavigate } from "react-router";
import { ref as dbRef, push, update, serverTimestamp } from "firebase/database";
import { auth, db } from "../../firebase-config";
import Nav from "../components/Nav";

export default function CreateCollection() {
  const [name, setName] = useState("");
  const [type, setType] = useState("books");
  const [coverUrl, setCoverUrl] = useState("");
  const [imgOk, setImgOk] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const navigate = useNavigate();

  const makeSlug = (raw) =>
    String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 20);

  function validateName(n) {
    const plain = String(n || "").trim();
    if (plain.length < 3) {
      return "Navnet skal være mindst 3 tegn.";
    }
    return null;
  }

  function validateUrl(u) {
    const re = /^https:\/\/.+\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i;
    return re.test((u || "").trim());
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const v = validateName(name);
    if (v) return setError(v);

    if (!validateUrl(coverUrl)) {
      return setError(
        "Indsæt en gyldig HTTPS billed-URL (jpg/png/webp/gif/svg)."
      );
    }
    if (imgOk === false) {
      return setError("Billedet kunne ikke indlæses. Tjek URL’en.");
    }

    const user = auth.currentUser;
    if (!user?.uid) {
      return setError("Du skal være logget ind for at oprette en collection.");
    }

    const uid = user.uid;
    const title = String(name).trim();
    const slug = makeSlug(name);

    if (!slug || slug.length < 3) {
      return setError(
        "Navnet skal indeholde mindst 3 bogstaver/tal (til slug)."
      );
    }

    setLoading(true);
    try {
      const collectionsRef = dbRef(db, `users/${uid}/collections`);
      const newRef = push(collectionsRef);
      const collectionId = newRef.key;
      const now = serverTimestamp();

      const updates = {};
      updates[`users/${uid}/collections/${collectionId}/id`] = collectionId;
      updates[`users/${uid}/collections/${collectionId}/title`] = title;
      updates[`users/${uid}/collections/${collectionId}/slug`] = slug;
      updates[`users/${uid}/collections/${collectionId}/type`] = type;
      updates[`users/${uid}/collections/${collectionId}/coverImage`] =
        coverUrl.trim();
      updates[`users/${uid}/collections/${collectionId}/createdAt`] = now;
      updates[`users/${uid}/collections/${collectionId}/updatedAt`] = now;

      updates[`users/${uid}/collections/${collectionId}/title_lower`] =
        title.toLowerCase();

      updates[`users/${uid}/collectionItems/_placeholder`] = true;
      updates[`users/${uid}/collectionItems/_placeholder`] = null;

      await update(dbRef(db), updates);

      setSuccess("Collection oprettet!");
      setName("");
      setCoverUrl("");
      setImgOk(null);

      navigate(`/users/${uid}/collections/${collectionId}`);
    } catch (err) {
      console.error("CreateCollection error:", err);
      setError(err?.message || "Noget gik galt ved oprettelsen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ paddingBottom: 130 }}>
      <h1 className="page-title">My next collection</h1>

      <form onSubmit={handleSubmit} noValidate>
        <div className="collection-btns">
          <button
            type="button"
            onClick={() => setType("books")}
            className={`collection-btn ${type === "books" ? "active" : ""}`}
          >
            Books
          </button>
          <button
            type="button"
            onClick={() => setType("vinyl")}
            className={`collection-btn ${type === "vinyl" ? "active" : ""}`}
          >
            Vinyls
          </button>
          <button
            type="button"
            onClick={() => setType("albums")}
            className={`collection-btn ${type === "albums" ? "active" : ""}`}
          >
            Albums
          </button>
        </div>

        <div className="login-inputs login-form">
          <p>Name collection</p>
          <input
            type="text"
            placeholder="Enter name of collection"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={3}
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
              if (!validateUrl(e.target.value)) setImgOk(false);
            }}
            required
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
            disabled={loading || imgOk === false}
          >
            {loading ? "Opretter..." : "Opret collection"}
          </button>
        </div>

        {error && <div style={{ color: "red" }}>{error}</div>}
        {success && <div style={{ color: "green" }}>{success}</div>}
      </form>
      <Nav />
    </main>
  );
}
