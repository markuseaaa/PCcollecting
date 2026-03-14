import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { ref, onValue, get } from "firebase/database";
import { auth, db } from "../../firebase-config";
import Nav from "../components/Nav";

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
  const itemMetaCacheRef = useRef(new Map());

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
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

    const itemRef = ref(db, `users/${uid}/ownedItems`);
    unsubs.push(
      onValue(itemRef, (snap) => {
        const val = snap.val() || {};
        const ids = Object.keys(val).filter((k) => !k.startsWith("_"));
        const ownedEntries = ids.map((id) => ({ id, ...val[id] }));

        (async () => {
          const missingIds = ids.filter((id) => !itemMetaCacheRef.current.has(id));
          if (missingIds.length > 0) {
            const snaps = await Promise.all(
              missingIds.map((id) => get(ref(db, `items/${id}`)))
            );
            missingIds.forEach((id, index) => {
              const itemVal = snaps[index]?.exists() ? snaps[index].val() || {} : {};
              itemMetaCacheRef.current.set(id, {
                member: String(itemVal.member || ""),
                group: String(itemVal.group || ""),
              });
            });
          }

          const next = ownedEntries.map((entry) => {
            const meta = itemMetaCacheRef.current.get(entry.id) || {};
            return {
              ...entry,
              member: meta.member || "",
              group: meta.group || "",
            };
          });
          setItems(next);
        })();
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

      <Nav />
    </main>
  );
}
