import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ref as dbRef, get, push, update, serverTimestamp } from "firebase/database";
import { auth, db } from "../../firebase-config";
import Nav from "../components/Nav";
import StorageImage from "../components/StorageImage";

export default function AddItem() {
  const [query, setQuery] = useState("");
  const [allItems, setAllItems] = useState([]);
  const [ownedItemIds, setOwnedItemIds] = useState([]);
  const [collections, setCollections] = useState([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [addingId, setAddingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function load() {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setLoading(false);
        return;
      }

      try {
        const [itemsSnap, collectionsSnap, ownedSnap] = await Promise.all([
          get(dbRef(db, "items")),
          get(dbRef(db, `users/${uid}/collections`)),
          get(dbRef(db, `users/${uid}/collectionItems`)),
        ]);

        if (!alive) return;

        const itemVal = itemsSnap.exists() ? itemsSnap.val() : {};
        const itemList = Object.keys(itemVal || {})
          .filter((k) => !k.startsWith("_"))
          .map((k) => ({ id: k, ...itemVal[k] }))
          .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
        setAllItems(itemList);

        const colVal = collectionsSnap.exists() ? collectionsSnap.val() : {};
        const colList = Object.keys(colVal || {})
          .filter((k) => !k.startsWith("_"))
          .map((k) => ({ id: k, ...colVal[k] }));
        setCollections(colList);
        setSelectedCollectionId("");

        const ownedVal = ownedSnap.exists() ? ownedSnap.val() : {};
        const owned = new Set();
        for (const key of Object.keys(ownedVal || {})) {
          if (key.startsWith("_")) continue;
          const item = ownedVal[key] || {};
          const sourceId = String(item.sourceItemId || "").trim();
          const fallbackId = String(item.id || "").trim();
          if (sourceId) owned.add(sourceId);
          else if (fallbackId) owned.add(fallbackId);
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

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    const ownedSet = new Set(ownedItemIds.map((id) => String(id)));
    const availableItems = allItems.filter((item) => !ownedSet.has(String(item.id)));

    if (!term) return availableItems.slice(0, 40);
    return availableItems.filter((item) =>
      `${item.title || ""} ${item.group || ""} ${item.member || ""} ${item.version || item.era || ""}`
        .toLowerCase()
        .includes(term)
    );
  }, [allItems, query, ownedItemIds]);

  async function addToCollection(item) {
    setError("");
    setSuccess("");

    const uid = auth.currentUser?.uid;
    if (!uid) return setError("You must be logged in.");
    const targetCollectionId = selectedCollectionId || "";

    setAddingId(item.id);
    try {
      const currentItemsSnap = await get(dbRef(db, `users/${uid}/collectionItems`));
      if (currentItemsSnap.exists()) {
        let duplicate = false;
        currentItemsSnap.forEach((ch) => {
          const val = ch.val() || {};
          if (val.sourceItemId === item.id || ch.key === item.id) {
            duplicate = true;
            return true;
          }
          return false;
        });
        if (duplicate) {
          setSuccess("Card is already in your My Photocards.");
          setAddingId("");
          return;
        }
      }

      const newRef = push(dbRef(db, `users/${uid}/collectionItems`));
      const newId = newRef.key;
      const now = serverTimestamp();

      const payload = {
        id: newId,
        sourceItemId: item.id,
        collectionId: targetCollectionId,
        title: item.title || "",
        group: item.group || "",
        member: item.member || "",
        album: item.album || "",
        version: item.version || item.era || "",
        rarity: item.rarity || "",
        sourceName: item.sourceName || "",
        pobStore: item.pobStore || "",
        imageUrl: item.imageUrl || item.coverImage || "",
        imagePath: item.imagePath || "",
        thumbPath: item.thumbPath || "",
        createdAt: now,
        updatedAt: now,
      };

      await update(dbRef(db), {
        [`users/${uid}/collectionItems/${newId}`]: payload,
        [`users/${uid}/collectionItems/_placeholder`]: true,
      });

      setSuccess(
        targetCollectionId
          ? "Photocard added to collection."
          : "Photocard added to My Photocards."
      );
      setOwnedItemIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
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
            placeholder="group, member, version"
          />
        </label>
      </section>

      {loading && <p className="muted">Loading library...</p>}
      {error && <p className="error-text">{error}</p>}
      {success && <p className="success-text">{success}</p>}

      <div className="card-grid">
        {results.map((item) => (
          <article key={item.id} className="photo-card static">
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
              <p className="photo-meta">
                {item.album || item.sourceName || "Unknown source"}
                {item.version ? ` • ${item.version}` : ""}
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

      <Nav />
    </main>
  );
}
