import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ref, get } from "firebase/database";
import { auth, db } from "../../firebase-config";
import { formatRarityLabel } from "../lib/rarity";
import { formatPobStoreName } from "../lib/pobStore";
import Nav from "../components/Nav";

export default function DetailPage() {
  const { id, uid: routeUid, collectionId } = useParams();
  const [item, setItem] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const uid = routeUid || auth.currentUser?.uid;
        let found = null;

        if (uid && id) {
          const userItem = await get(ref(db, `users/${uid}/collectionItems/${id}`));
          if (userItem.exists()) found = { id, ...userItem.val() };
        }

        if (!found && auth.currentUser?.uid && id) {
          const snap = await get(ref(db, `users/${auth.currentUser.uid}/collectionItems`));
          if (snap.exists()) {
            snap.forEach((ch) => {
              const val = ch.val() || {};
              if (ch.key === id || val.sourceItemId === id) {
                found = { id: ch.key, ...val };
                return true;
              }
              return false;
            });
          }
        }

        if (!found && id) {
          const globalItem = await get(ref(db, `items/${id}`));
          if (globalItem.exists()) found = { id, ...globalItem.val() };
        }

        if (!alive) return;
        if (!found) {
          setError("Photocard not found.");
        } else {
          setItem(found);
        }
      } catch (err) {
        if (!alive) return;
        setError(err?.message || "Could not load photocard.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [id, routeUid]);

  if (loading) {
    return (
      <main className="page-content with-nav-space">
        <p className="muted">Loading photocard...</p>
      </main>
    );
  }

  if (error || !item) {
    return (
      <main className="page-content with-nav-space">
        <p className="error-text">{error || "Not found"}</p>
        <Nav />
      </main>
    );
  }

  const backTo = collectionId
    ? `/users/${auth.currentUser?.uid}/collections/${collectionId}`
    : "/homepage";

  return (
    <main className="page-content with-nav-space">
      <section className="detail-wrap">
        <Link to={backTo} className="btn btn-ghost small">
          Back
        </Link>
        <img
          src={item.imageUrl || item.coverImage || ""}
          alt={item.title || "Photocard"}
          className="detail-image"
        />
        <h1>{item.title || "Untitled"}</h1>
        <ul className="detail-list">
          <li>
            <span>Group</span>
            <strong>{item.group || "-"}</strong>
          </li>
          <li>
            <span>Member</span>
            <strong>{item.member || "-"}</strong>
          </li>
          <li>
            <span>Album</span>
            <strong>{item.album || "-"}</strong>
          </li>
          <li>
            <span>Version</span>
            <strong>{item.version || item.era || "-"}</strong>
          </li>
          <li>
            <span>Rarity</span>
            <strong>{formatRarityLabel(item.rarity) || "-"}</strong>
          </li>
          {item.pobStore ? (
            <li>
              <span>POB store</span>
              <strong>{formatPobStoreName(item.pobStore)}</strong>
            </li>
          ) : null}
          {item.otherType ? (
            <li>
              <span>Other type</span>
              <strong>{item.otherType}</strong>
            </li>
          ) : null}
          {item.sourceName ? (
            <li>
              <span>Source</span>
              <strong>{item.sourceName}</strong>
            </li>
          ) : null}
        </ul>
      </section>

      <Nav />
    </main>
  );
}
