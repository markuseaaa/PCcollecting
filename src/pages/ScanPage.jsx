import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ref as dbRef, get, push, update, serverTimestamp } from "firebase/database";
import { auth, db } from "../../firebase-config";
import {
  computeAverageHashFromBlob,
  computeCenteredAverageHashFromBlob,
  hammingDistance,
} from "../lib/imageHash";
import Nav from "../components/Nav";
import StorageImage from "../components/StorageImage";

function similarityFromDistance(distance, maxBits = 256) {
  if (!Number.isFinite(distance)) return 0;
  return Math.max(0, Math.round((1 - distance / maxBits) * 100));
}

export default function ScanPage() {
  const [collections, setCollections] = useState([]);
  const [ownedItemIds, setOwnedItemIds] = useState([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [scanFile, setScanFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [matches, setMatches] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [addingId, setAddingId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const [colSnap, itemSnap, ownedSnap] = await Promise.all([
        get(dbRef(db, `users/${uid}/collections`)),
        get(dbRef(db, "items")),
        get(dbRef(db, `users/${uid}/collectionItems`)),
      ]);

      if (!alive) return;

      const colVal = colSnap.exists() ? colSnap.val() : {};
      const colList = Object.keys(colVal || {})
        .filter((k) => !k.startsWith("_"))
        .map((k) => ({ id: k, ...colVal[k] }));
      setCollections(colList);
      setSelectedCollectionId("");

      const ownedVal = ownedSnap.exists() ? ownedSnap.val() : {};
      const owned = new Set();
      for (const key of Object.keys(ownedVal || {})) {
        if (key.startsWith("_")) continue;
        const entry = ownedVal[key] || {};
        const sourceId = String(entry.sourceItemId || "").trim();
        const fallbackId = String(entry.id || "").trim();
        if (sourceId) owned.add(sourceId);
        else if (fallbackId) owned.add(fallbackId);
      }
      setOwnedItemIds(Array.from(owned));

      // Warm-up read to ensure initial scan has data ready.
      if (itemSnap.exists()) {
        // no-op
      }
    }

    load().catch((err) => setError(err?.message || "Could not load scan data."));
    return () => {
      alive = false;
    };
  }, []);

  async function refreshGlobalItems() {
    const itemSnap = await get(dbRef(db, "items"));
    const itemVal = itemSnap.exists() ? itemSnap.val() : {};
    const itemList = Object.keys(itemVal || {})
      .filter((k) => !k.startsWith("_"))
      .map((k) => ({ id: k, ...itemVal[k] }));
    return itemList;
  }

  useEffect(() => {
    if (!scanFile) {
      setPreviewUrl("");
      return;
    }

    const url = URL.createObjectURL(scanFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [scanFile]);

  async function handleScan() {
    setError("");
    if (!scanFile) return setError("Choose a photo first.");

    setScanning(true);
    try {
      const [hash, centeredHash, latestItems] = await Promise.all([
        computeAverageHashFromBlob(scanFile, 16),
        computeCenteredAverageHashFromBlob(scanFile, 16, 2 / 3),
        refreshGlobalItems(),
      ]);

      const ownedSet = new Set(ownedItemIds.map((id) => String(id)));
      const latestIndexed = latestItems.filter(
        (item) =>
          typeof item.imgHash === "string" &&
          item.imgHash.length > 0 &&
          !ownedSet.has(String(item.id))
      );

      const ranked = latestIndexed
        .map((item) => {
          const distA = hammingDistance(hash, item.imgHash);
          const distB = hammingDistance(centeredHash, item.imgHash);
          const dist = Math.min(distA, distB);
          return {
            ...item,
            dist,
            similarity: similarityFromDistance(dist),
          };
        })
        .filter((item) => item.similarity > 30)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 12);

      setMatches(ranked);
    } catch (err) {
      setError(err?.message || "Could not scan this image.");
      setMatches([]);
    } finally {
      setScanning(false);
    }
  }

  async function handleAdd(item) {
    setError("");

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
          setError("This photocard is already in your My Photocards.");
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
        rarity: item.rarity || "",
        version: item.version || "",
        sourceName: item.sourceName || "",
        pobStore: item.pobStore || "",
        otherType: item.otherType || "",
        imageUrl: item.imageUrl || "",
        imagePath: item.imagePath || "",
        thumbPath: item.thumbPath || "",
        imgHash: item.imgHash || "",
        createdAt: now,
        updatedAt: now,
      };

      await update(dbRef(db), {
        [`users/${uid}/collectionItems/${newId}`]: payload,
        [`users/${uid}/collectionItems/_placeholder`]: true,
      });
      setOwnedItemIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
      setMatches((prev) => prev.filter((match) => match.id !== item.id));
    } catch (err) {
      setError(err?.message || "Could not add photocard.");
    } finally {
      setAddingId("");
    }
  }

  return (
    <main className="page-content with-nav-space">
      <section className="section-block">
        <h1>Scan photocard</h1>
        <p className="muted">
          Take a photo and we will find the closest cards already in the system.
        </p>
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
          Scan image
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setScanFile(e.target.files?.[0] || null)}
          />
        </label>

        <div className="center-action">
          <button className="btn btn-primary" type="button" onClick={handleScan} disabled={scanning || !scanFile}>
            {scanning ? "Scanning..." : "Find matches"}
          </button>
        </div>

        {previewUrl ? (
          <div className="preview-wrap">
            <img src={previewUrl} alt="Scan preview" className="preview-image" />
          </div>
        ) : null}

        {error && <p className="error-text">{error}</p>}
      </section>

      {matches.length === 0 && !scanning ? (
        <section className="section-block">
          <p className="muted">
            No matches yet. Try scanning, or <Link to="/submit">create a new photocard</Link>.
          </p>
        </section>
      ) : null}

      <div className="card-grid">
        {matches.map((item) => (
          <article key={item.id} className="photo-card static">
            <StorageImage
              src={item.imageUrl || ""}
              thumbPath={item.thumbPath}
              alt={item.title || "Photocard"}
            />
            <div>
              <p className="photo-title">{item.title || "Untitled"}</p>
              <p className="photo-meta">
                {item.group || "Unknown group"} - {item.member || "Unknown"}
              </p>
              <p className="photo-meta">Match: {item.similarity}%</p>
              <button
                className="btn btn-primary small"
                type="button"
                onClick={() => handleAdd(item)}
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
