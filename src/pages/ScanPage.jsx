import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ref as dbRef, get, push, update, serverTimestamp } from "firebase/database";
import { auth, db } from "../../firebase-config";
import {
  computeAverageHashFromBlob,
  computeCenteredAverageHashFromBlob,
  hammingDistance,
} from "../lib/imageHash";
import { cropImageFileToBlob } from "../lib/imageCrop";
import Nav from "../components/Nav";
import StorageImage from "../components/StorageImage";

function similarityFromDistance(distance, maxBits = 256) {
  if (!Number.isFinite(distance)) return 0;
  return Math.max(0, Math.round((1 - distance / maxBits) * 100));
}

const MIN_MATCH_PERCENT = 60;

export default function ScanPage() {
  const [collections, setCollections] = useState([]);
  const [ownedItemIds, setOwnedItemIds] = useState([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [scanFile, setScanFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [cropEnabled, setCropEnabled] = useState(true);
  const [cropZoom, setCropZoom] = useState(1.15);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [matches, setMatches] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [addingId, setAddingId] = useState("");
  const [error, setError] = useState("");
  const cropPreviewRef = useRef(null);
  const dragRef = useRef(null);
  const pointersRef = useRef(new Map());
  const pinchRef = useRef(null);

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

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function applyZoomChange(nextZoom) {
    setCropZoom(clamp(nextZoom, 1, 3));
  }

  function distanceBetweenPointers(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function handleCropPointerDown(e) {
    if (!cropEnabled) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: cropX,
      baseY: cropY,
    };
    setIsDraggingCrop(true);
    e.currentTarget.setPointerCapture(e.pointerId);

    if (pointersRef.current.size === 2) {
      const [p1, p2] = [...pointersRef.current.values()];
      pinchRef.current = {
        startDistance: distanceBetweenPointers(p1, p2),
        baseZoom: cropZoom,
      };
      setIsDraggingCrop(false);
    }
  }

  function handleCropPointerMove(e) {
    if (!cropEnabled) return;
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const [p1, p2] = [...pointersRef.current.values()];
      const currentDistance = distanceBetweenPointers(p1, p2);
      const ratio = currentDistance / pinchRef.current.startDistance;
      applyZoomChange(pinchRef.current.baseZoom * ratio);
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setCropX(clamp(drag.baseX + dx, -260, 260));
    setCropY(clamp(drag.baseY + dy, -360, 360));
  }

  function handleCropPointerUp(e) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    const drag = dragRef.current;
    if (drag && drag.pointerId === e.pointerId) {
      dragRef.current = null;
      setIsDraggingCrop(false);
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function handleCropWheel(e) {
    if (!cropEnabled) return;
    e.preventDefault();
    applyZoomChange(cropZoom + -e.deltaY * 0.0015);
  }

  async function handleScan() {
    setError("");
    if (!scanFile) return setError("Choose a photo first.");

    setScanning(true);
    try {
      let scanBlob = scanFile;
      if (cropEnabled) {
        const previewRect = cropPreviewRef.current?.getBoundingClientRect();
        scanBlob = await cropImageFileToBlob(scanFile, {
          zoom: cropZoom,
          offsetX: cropX,
          offsetY: cropY,
          previewWidth: previewRect?.width || 0,
          previewHeight: previewRect?.height || 0,
        });
      }

      const [hash, centeredHash, latestItems] = await Promise.all([
        computeAverageHashFromBlob(scanBlob, 16),
        computeCenteredAverageHashFromBlob(scanBlob, 16, 2 / 3),
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
        .filter((item) => item.similarity >= MIN_MATCH_PERCENT)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3);

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
      setScanFile(null);
      setCropZoom(1.15);
      setCropX(0);
      setCropY(0);
      setMatches([]);
      setError("");
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
            onChange={(e) => setScanFile(e.target.files?.[0] || null)}
          />
        </label>

        <div className="center-action">
          <button className="btn btn-primary" type="button" onClick={handleScan} disabled={scanning || !scanFile}>
            {scanning ? "Scanning..." : "Find matches"}
          </button>
        </div>

        {previewUrl ? (
          <div className="crop-panel">
            <div
              className={`crop-preview ${isDraggingCrop ? "dragging" : ""}`}
              ref={cropPreviewRef}
              onPointerDown={handleCropPointerDown}
              onPointerMove={handleCropPointerMove}
              onPointerUp={handleCropPointerUp}
              onPointerCancel={handleCropPointerUp}
              onWheel={handleCropWheel}
            >
              <img
                src={previewUrl}
                alt="Scan preview"
                style={{
                  transform: `translate(${cropX}px, ${cropY}px) scale(${cropZoom})`,
                }}
              />
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={cropEnabled}
                onChange={(e) => setCropEnabled(e.target.checked)}
              />
              Crop before scanning
            </label>

            <div className="crop-controls">
              <button
                type="button"
                className="btn btn-ghost small"
                onClick={() => applyZoomChange(cropZoom - 0.1)}
                disabled={!cropEnabled}
              >
                -
              </button>
              <span className="crop-zoom-label">Zoom {cropZoom.toFixed(2)}x</span>
              <button
                type="button"
                className="btn btn-ghost small"
                onClick={() => applyZoomChange(cropZoom + 0.1)}
                disabled={!cropEnabled}
              >
                +
              </button>
              <button
                type="button"
                className="btn btn-ghost small"
                onClick={() => {
                  setCropZoom(1.15);
                  setCropX(0);
                  setCropY(0);
                }}
                disabled={!cropEnabled}
              >
                Reset
              </button>
            </div>
            <p className="crop-hint muted">Drag to move. Pinch or scroll to zoom.</p>
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
