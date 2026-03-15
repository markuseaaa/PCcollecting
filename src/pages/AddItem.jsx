import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  ref as dbRef,
  get,
  query as dbQuery,
  orderByChild,
  endAt,
  limitToLast,
  update,
  serverTimestamp,
} from "firebase/database";
import { auth, db } from "../../firebase-config";
import { formatRarityLabel } from "../lib/rarity";
import { buildOwnershipAssignmentUpdates } from "../lib/ownership";
import {
  appendCachedCollectionItem,
  fetchUserCollections,
  fetchUserOwnedRefs,
  setCachedItemSummary,
} from "../lib/userDataCache";
import Nav from "../components/Nav";
import StorageImage from "../components/StorageImage";

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export default function AddItem() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [ownedItemIds, setOwnedItemIds] = useState([]);
  const [collections, setCollections] = useState([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [addingId, setAddingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [visibleCount, setVisibleCount] = useState(24);

  const SEARCH_BATCH_SIZE = 250;
  const SEARCH_MAX_BATCHES = 120;
  const SEARCH_MAX_RESULTS = 5000;

  useEffect(() => {
    let alive = true;

    async function load() {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setLoading(false);
        return;
      }

      try {
        const [colList, ownedRefsVal] = await Promise.all([
          fetchUserCollections(uid),
          fetchUserOwnedRefs(uid),
        ]);

        if (!alive) return;

        setCollections(colList);
        setSelectedCollectionId("");

        const owned = new Set();
        for (const key of Object.keys(ownedRefsVal || {})) {
          if (key.startsWith("_")) continue;
          owned.add(String(key));
        }
        setOwnedItemIds(Array.from(owned));
      } catch (err) {
        setError(err?.message || "Could not load data.");
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const rawTerm = query.trim();
    if (rawTerm.length < 3) {
      setResults([]);
      setSearching(false);
      return () => {
        alive = false;
      };
    }

    const term = normalizeSearchText(rawTerm);
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return () => {
        alive = false;
      };
    }

    const ownedSet = new Set(ownedItemIds.map((id) => String(id)));

    async function fetchBatch(beforeCreatedAt = null) {
      const constraints = [orderByChild("createdAt")];
      if (Number.isFinite(beforeCreatedAt)) constraints.push(endAt(beforeCreatedAt));
      constraints.push(limitToLast(SEARCH_BATCH_SIZE));
      const snap = await get(dbQuery(dbRef(db, "itemSummaries"), ...constraints));
      const val = snap.exists() ? snap.val() : {};
      return Object.keys(val || {})
        .filter((k) => !k.startsWith("_"))
        .map((k) => ({ id: k, ...val[k] }))
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    }

    setSearching(true);
    setError("");

    (async () => {
      const found = [];
      const seen = new Set();
      let cursor = null;
      let batches = 0;

      while (alive && batches < SEARCH_MAX_BATCHES && found.length < SEARCH_MAX_RESULTS) {
        const batch = await fetchBatch(cursor);
        if (!batch.length) break;

        for (const item of batch) {
          const id = String(item.id || "").trim();
          if (!id || seen.has(id) || ownedSet.has(id)) continue;
          seen.add(id);
          const haystack = normalizeSearchText(
            `${item.title || ""} ${item.group || ""} ${item.member || ""} ${item.album || ""} ${
              item.sourceName || ""
            } ${item.version || item.era || ""} ${item.rarity || ""}`
          );
          if (!haystack.includes(term)) continue;
          found.push(item);
          setCachedItemSummary(id, item);
          if (found.length >= SEARCH_MAX_RESULTS) break;
        }

        const oldestCreatedAt = Number(
          batch.reduce((min, item) => {
            const ts = Number(item.createdAt || 0);
            return Number.isFinite(ts) ? Math.min(min, ts) : min;
          }, Number.POSITIVE_INFINITY)
        );
        if (!Number.isFinite(oldestCreatedAt) || oldestCreatedAt <= 0) break;
        cursor = oldestCreatedAt - 1;
        batches += 1;
      }

      if (!alive) return;
      setResults(found);
    })()
      .catch((err) => {
        if (!alive) return;
        setError(err?.message || "Could not search photocards.");
        setResults([]);
      })
      .finally(() => {
        if (alive) setSearching(false);
      });

    return () => {
      alive = false;
    };
  }, [query, ownedItemIds]);

  const visibleResults = useMemo(
    () => results.slice(0, visibleCount),
    [results, visibleCount]
  );

  useEffect(() => {
    setVisibleCount(24);
  }, [query]);

  async function addToCollection(item) {
    setError("");
    setSuccess("");

    const uid = auth.currentUser?.uid;
    if (!uid) return setError("You must be logged in.");
    const targetCollectionId = selectedCollectionId || "";

    setAddingId(item.id);
    try {
      const ownedRefSnap = await get(dbRef(db, `users/${uid}/ownedItems/${item.id}`));
      if (ownedRefSnap.exists()) {
        setSuccess("Card is already in your My Photocards.");
        setAddingId("");
        return;
      }

      const now = serverTimestamp();

      await update(dbRef(db), {
        ...buildOwnershipAssignmentUpdates({
          uid,
          itemId: item.id,
          nextCollectionId: targetCollectionId,
          createdAt: now,
          updatedAt: now,
        }),
      });

      setSuccess(
        targetCollectionId
          ? "Photocard added to collection."
          : "Photocard added to My Photocards."
      );
      setOwnedItemIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
      appendCachedCollectionItem(uid, {
        ...item,
        id: item.id,
        sourceItemId: item.id,
        collectionId: targetCollectionId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      setResults((prev) => prev.filter((entry) => String(entry.id) !== String(item.id)));
    } catch (err) {
      setError(err?.message || "Could not add photocard.");
    } finally {
      setAddingId("");
    }
  }

  return (
    <main className="page-content with-nav-space">
      <section className="section-block">
        <h1>Add photocard</h1>
        <p className="muted">
          Search first. If the card does not exist, create it once and everyone
          can add it.
        </p>
        <div className="center-action add-item-actions">
          <Link to="/scan" className="btn btn-primary">
            Scan photocard
          </Link>
          <Link to="/submit" className="btn btn-ghost">
            Card not found? Create new
          </Link>
        </div>
      </section>

      <section className="section-block form-grid compact">
        <label>
          Target collection (optional)
          <select
            value={selectedCollectionId}
            onChange={(e) => setSelectedCollectionId(e.target.value)}
          >
            <option value="">No collection (My Photocards only)</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.title || "Untitled"}
              </option>
            ))}
          </select>
        </label>

        <label>
          Search
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type at least 3 letters..."
          />
        </label>
      </section>

      {loading && <p className="muted">Loading collections...</p>}
      {!loading && searching && query.trim().length >= 3 ? (
        <p className="muted">Loading search results...</p>
      ) : null}
      {error && <p className="error-text">{error}</p>}
      {success && <p className="success-text">{success}</p>}
      {!loading && query.trim().length < 3 ? (
        <p className="muted search-hint">Start typing (minimum 3 letters) to search photocards.</p>
      ) : null}
      {!loading && !searching && query.trim().length >= 3 && results.length === 0 ? (
        <p className="muted search-hint">No matches found.</p>
      ) : null}

      <div className="card-grid">
        {visibleResults.map((item) => (
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
              <p className="photo-meta">
                {item.album || item.sourceName || "Unknown source"}
                {item.version ? ` • ${item.version}` : ""}
                {item.rarity ? ` • ${formatRarityLabel(item.rarity)}` : ""}
              </p>
              <button
                className="btn btn-primary small"
                onClick={() => addToCollection(item)}
                disabled={addingId === item.id}
              >
                {addingId === item.id ? "Adding..." : "Add"}
              </button>
            </div>
          </article>
        ))}
      </div>

      {!loading && visibleResults.length < results.length ? (
        <div className="center-action">
          <button
            type="button"
            className="btn btn-ghost small"
            onClick={() => setVisibleCount((prev) => prev + 24)}
          >
            Load more
          </button>
        </div>
      ) : null}

      <Nav />
    </main>
  );
}
