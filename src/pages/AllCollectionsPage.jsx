import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ref, onValue } from "firebase/database";
import { auth, db } from "../../firebase-config";
import Nav from "../components/Nav";

export default function AllCollectionsPage() {
  const [cols, setCols] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setCols([]);
      setLoading(false);
      return;
    }

    const r = ref(db, `users/${uid}/collections`);
    const unsubscribe = onValue(
      r,
      (snap) => {
        const val = snap.val() || {};
        const list = Object.keys(val)
          .filter((k) => !k.startsWith("_"))
          .map((k) => ({ id: k, ...val[k] }))
          .sort(
            (a, b) =>
              (b.updatedAt || b.createdAt || 0) -
              (a.updatedAt || a.createdAt || 0)
          );
        setCols(list);
        setLoading(false);
      },
      () => {
        setCols([]);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const uid = auth.currentUser?.uid;

  return (
    <main>
      <h1 className="page-title">All collections</h1>

      {loading && <p>Loading…</p>}

      {!loading && cols.length === 0 && (
        <p style={{ opacity: 0.8, padding: "0 15px" }}>
          You don’t have any collections yet.
        </p>
      )}

      {cols.length > 0 && (
        <div className="categories-strip">
          {cols.map((col) => (
            <Link
              key={col.id}
              to={`/users/${uid}/collections/${col.id}`}
              className="cover-frame"
              aria-label={`Open collection ${col.title}`}
            >
              <article className="category-card">
                {col.coverImage && (
                  <img
                    src={col.coverImage}
                    alt={col.title || "Collection cover"}
                    className="category-cover"
                    loading="lazy"
                  />
                )}
                <h3 className="category-title">
                  {col.title || col.slug || "Untitled"}
                </h3>
              </article>
            </Link>
          ))}
        </div>
      )}
      <Nav />
    </main>
  );
}
