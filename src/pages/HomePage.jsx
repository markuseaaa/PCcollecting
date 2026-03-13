import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ref, onValue, get } from "firebase/database";
import { auth, db } from "../../firebase-config";
import Nav from "../components/Nav";
import StorageImage from "../components/StorageImage";

function countByMember(items) {
  const map = new Map();
  for (const item of items) {
    const key = (item.member || "Unknown").trim() || "Unknown";
    if (key.toLowerCase() === "unit") continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([member, count]) => ({ member, count }));
}

function countByGroup(items) {
  const map = new Map();
  for (const item of items) {
    const key = (item.group || "Unknown").trim() || "Unknown";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([group, count]) => ({ group, count }));
}

export default function HomePage() {
  const [collections, setCollections] = useState([]);
  const [items, setItems] = useState([]);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }

    const unsubs = [];

    const colRef = ref(db, `users/${uid}/collections`);
    unsubs.push(
      onValue(colRef, (snap) => {
        const val = snap.val() || {};
        const next = Object.keys(val)
          .filter((k) => !k.startsWith("_"))
          .map((k) => ({ id: k, ...val[k] }))
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        setCollections(next);
      }),
    );

    const itemRef = ref(db, `users/${uid}/collectionItems`);
    unsubs.push(
      onValue(itemRef, (snap) => {
        const val = snap.val() || {};
        const next = Object.keys(val)
          .filter((k) => !k.startsWith("_"))
          .map((k) => ({ id: k, ...val[k] }))
          .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
        setItems(next);
        setLoading(false);
      }),
    );

    get(ref(db, `users/${uid}/username`)).then((snap) => {
      if (snap.exists()) setUsername(String(snap.val() || ""));
    });

    return () => {
      for (const unsub of unsubs) {
        if (typeof unsub === "function") unsub();
      }
    };
  }, []);

  const topMembers = useMemo(() => countByMember(items), [items]);
  const topGroups = useMemo(() => countByGroup(items), [items]);
  const latestCards = useMemo(() => items.slice(0, 8), [items]);

  return (
    <main className="page-content with-nav-space home-page">
      <section className="dashboard-hero">
        <h1>
          Hi {username || "collector"}, you have {items.length} photocards.
        </h1>
        <p>
          Keep track of member pulls and album versions across all your binders.
        </p>
        <div className="dashboard-hero-actions">
          <Link to="/createcollection" className="btn btn-primary">
            New collection
          </Link>
          <Link to="/additem" className="btn btn-ghost">
            Add photocard
          </Link>
        </div>
      </section>

      <section className="stats-grid">
        <article className="stat-card">
          <p className="stat-label">Collections</p>
          <p className="stat-value">{collections.length}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Photocards</p>
          <p className="stat-value">{items.length}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Top member</p>
          <p className="stat-value">{topMembers[0]?.member || "-"}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Top group</p>
          <p className="stat-value">{topGroups[0]?.group || "-"}</p>
        </article>
      </section>

      <section className="section-block">
        <h2>Most collected idols</h2>
        {topMembers.length === 0 ? (
          <p className="muted">No member data yet.</p>
        ) : (
          <ul className="member-list">
            {topMembers.map((entry) => (
              <li key={entry.member}>
                <span>{entry.member}</span>
                <strong>{entry.count}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section-block">
        <h2>Most collected groups</h2>
        {topGroups.length === 0 ? (
          <p className="muted">No group data yet.</p>
        ) : (
          <ul className="member-list">
            {topGroups.map((entry) => (
              <li key={entry.group}>
                <span>{entry.group}</span>
                <strong>{entry.count}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section-block">
        <h2>Latest uploads</h2>
        {loading && <p className="muted">Loading...</p>}
        {!loading && latestCards.length === 0 && (
          <p className="muted">Start by uploading your first photocard.</p>
        )}
        <div className="card-grid">
          {latestCards.map((item) => (
            <Link
              key={item.id}
              to={
                item.collectionId
                  ? `/users/${auth.currentUser?.uid}/collections/${item.collectionId}/items/${item.id}`
                  : `/items/${item.id}`
              }
              className="photo-card"
            >
              <StorageImage
                src={item.imageUrl || item.coverImage || ""}
                thumbPath={item.thumbPath}
                alt={item.title || "Photocard"}
              />
              <div>
                <p className="photo-title">{item.title || "Untitled"}</p>
                <p className="photo-meta">
                  {item.group || "Unknown group"} - {item.member || "Unknown"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <Nav />
    </main>
  );
}
