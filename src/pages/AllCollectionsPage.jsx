import { useEffect, useState } from "react";
import { Link } from "react-router";
import { auth } from "../../firebase-config";
import { fetchUserCollections } from "../lib/userDataCache";
import Nav from "../components/Nav";
import StorageImage from "../components/StorageImage";

export default function AllCollectionsPage() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }

    fetchUserCollections(uid)
      .then((next) => {
        if (!alive) return;
        setCollections(next);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
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
              imagePath={collection.coverImagePath}
              alt={collection.title || "Collection"}
              thumbOnly
            />
            <div>
              <p className="collection-title">{collection.title || "Untitled"}</p>
              <p className="collection-description">
                {collection.description || "Photocard binder"}
              </p>
              <p className="collection-visibility muted">
                {String(collection.visibility || "public").toLowerCase() === "private"
                  ? "Private"
                  : "Public"}
              </p>
            </div>
          </Link>
        ))}
      </div>

      <Nav />
    </main>
  );
}
