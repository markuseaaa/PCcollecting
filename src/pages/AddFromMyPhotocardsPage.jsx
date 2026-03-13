import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ref, get, update, serverTimestamp } from "firebase/database";
import { auth, db } from "../../firebase-config";
import StorageImage from "../components/StorageImage";
import Nav from "../components/Nav";

export default function AddFromMyPhotocardsPage() {
  const { collectionId } = useParams();
  const [collection, setCollection] = useState(null);
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [addingId, setAddingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setError("You must be logged in.");
        setLoading(false);
        return;
      }

      try {
        const [colSnap, itemSnap] = await Promise.all([
          get(ref(db, `users/${uid}/collections/${collectionId}`)),
          get(ref(db, `users/${uid}/collectionItems`)),
        ]);

        if (!alive) return;
        if (!colSnap.exists()) {
          setError("Collection not found.");
          setLoading(false);
          return;
        }

        const raw = itemSnap.exists() ? itemSnap.val() : {};
        const list = Object.keys(raw || {})
          .filter((k) => !k.startsWith("_"))
          .map((k) => ({ id: k, ...raw[k] }))
          .filter((item) => String(item.collectionId || "") !== String(collectionId))
          .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

        setCollection(colSnap.val() || {});
        setItems(list);
      } catch (err) {
        if (!alive) return;
        setError(err?.message || "Could not load your cards.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [collectionId]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      `${item.title || ""} ${item.group || ""} ${item.member || ""} ${item.album || ""}`
        .toLowerCase()
        .includes(term)
    );
  }, [items, query]);

  async function handleAdd(itemId) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setAddingId(itemId);
    setError("");

    try {
      await update(ref(db), {
        [`users/${uid}/collectionItems/${itemId}/collectionId`]: collectionId,
        [`users/${uid}/collectionItems/${itemId}/updatedAt`]: serverTimestamp(),
      });

      setItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (err) {
      setError(err?.message || "Could not add photocard to this collection.");
    } finally {
      setAddingId("");
    }
  }

  const uid = auth.currentUser?.uid;

  return (
    <main className="page-content with-nav-space">
      <section className="section-heading-row">
        <div>
          <h1>Add from My Photocards</h1>
          <p className="muted">
            Add existing cards to {collection?.title || "this collection"}.
          </p>
        </div>
        <Link to={`/users/${uid}/collections/${collectionId}`} className="btn btn-ghost small">
          Back
        </Link>
      </section>

      <section className="section-block">
        <label className="search-label">
          Search your cards
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="title, member, album"
          />
        </label>
      </section>

      {loading && <p className="muted">Loading your cards...</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && filtered.length === 0 ? (
        <div className="empty-state">
          <h2>No cards to add</h2>
          <p>All your cards are already in this collection, or no match found.</p>
        </div>
      ) : null}

      <div className="card-grid">
        {filtered.map((item) => (
          <article key={item.id} className="photo-card static">
            <StorageImage
              src={item.imageUrl || item.coverImage || ""}
              thumbPath={item.thumbPath}
              imagePath={item.imagePath}
              alt={item.title || "Photocard"}
              thumbOnly
            />
            <div>
              <p className="photo-title">{item.title || "Untitled"}</p>
              <p className="photo-meta">
                {item.group || "Unknown group"} - {item.member || "Unknown"}
              </p>
              <p className="photo-meta">{item.album || item.sourceName || "Unknown source"}</p>
              <button
                type="button"
                className="btn btn-primary small"
                onClick={() => handleAdd(item.id)}
                disabled={addingId === item.id}
              >
                {addingId === item.id ? "Adding..." : "Add"}
              </button>
            </div>
          </article>
        ))}
      </div>

      <Nav />
    </main>
  );
}
