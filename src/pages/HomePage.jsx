import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ref, get } from "firebase/database";
import { auth, db } from "../../firebase-config";
import {
  fetchItemSummariesByIds,
  fetchUserCollections,
  fetchUserOwnedRefs,
} from "../lib/userDataCache";
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

  useEffect(() => {
    let alive = true;
    const uid = auth.currentUser?.uid;
    if (!uid) {
      return;
    }

    (async () => {
      const [collectionList, ownedVal, usernameSnap] = await Promise.all([
        fetchUserCollections(uid),
        fetchUserOwnedRefs(uid),
        get(ref(db, `users/${uid}/username`)),
      ]);
      if (!alive) return;

      setCollections(collectionList);
      if (usernameSnap.exists()) setUsername(String(usernameSnap.val() || ""));

      const ids = Object.keys(ownedVal || {}).filter((k) => !k.startsWith("_"));
      const ownedEntries = ids.map((id) => ({ id, ...ownedVal[id] }));
      const mergedMeta = await fetchItemSummariesByIds(ids);

      if (!alive) return;
      const next = ownedEntries.map((entry) => {
        const meta = mergedMeta.get(entry.id) || {};
        return {
          ...entry,
          member: meta.member || "",
          group: meta.group || "",
        };
      });
      setItems(next);
    })().catch(() => {
      // Keep homepage resilient; stats can still render from whatever data exists.
    });

    return () => {
      alive = false;
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
