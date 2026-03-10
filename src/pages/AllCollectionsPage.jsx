import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ref, onValue } from "firebase/database";
import { auth, db } from "../../firebase-config";
import Nav from "../components/Nav";
import StorageImage from "../components/StorageImage";

export default function AllCollectionsPage() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }

    const unsub = onValue(ref(db, `users/${uid}/collections`), (snap) => {
      const val = snap.val() || {};
      const next = Object.keys(val)
        .filter((k) => !k.startsWith("_"))
        .map((k) => ({ id: k, ...val[k] }))
        .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
      setCollections(next);
      setLoading(false);
    });

    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  const uid = auth.currentUser?.uid;

  return (
    <main className="page-content with-nav-space">
      <section className="section-heading-row">
        <h1>Your photocard collections</h1>
        <Link to="/createcollection" className="btn btn-primary small">
          New
        </Link>
      </section>

      {loading && <p className="muted">Loading collections...</p>}
      {!loading && collections.length === 0 && (
        <div className="empty-state">
          <h2>No collections yet</h2>
          <p>Create your first binder and start adding photocards.</p>
        </div>
      )}

      <div className="collection-grid">
        {collections.map((collection) => (
          <Link
            key={collection.id}
            to={`/users/${uid}/collections/${collection.id}`}
            className="collection-tile"
          >
            <StorageImage
              src={collection.coverImage || ""}
              thumbPath={collection.coverThumbPath}
              alt={collection.title || "Collection"}
            />
            <div>
              <p className="photo-title">{collection.title || "Untitled"}</p>
              <p className="photo-meta">{collection.description || "Photocard binder"}</p>
            </div>
          </Link>
        ))}
      </div>

      <Nav />
    </main>
  );
}
