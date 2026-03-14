import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  ref as dbRef,
  get,
  query as dbQuery,
  orderByChild,
  equalTo,
  endAt,
  limitToLast,
  update,
  serverTimestamp,
} from "firebase/database";
import { auth, db } from "../../firebase-config";
import {
  computeAverageHashFromBlob,
  computeCenteredAverageHashFromBlob,
  hammingDistance,
} from "../lib/imageHash";
import { cropImageFileToBlob } from "../lib/imageCrop";
import { buildOwnershipAssignmentUpdates } from "../lib/ownership";
import Nav from "../components/Nav";
import StorageImage from "../components/StorageImage";

function similarityFromDistance(distance, maxBits = 256) {
  if (!Number.isFinite(distance)) return 0;
  return Math.max(0, Math.round((1 - distance / maxBits) * 100));
}

const MIN_MATCH_PERCENT = 60;
const SCAN_BATCH_SIZE = 250;
const MAX_SCAN_BATCHES = 20;

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export default function ScanPage() {
  const [collections, setCollections] = useState([]);
  const [ownedItemIds, setOwnedItemIds] = useState([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [scanGroup, setScanGroup] = useState("");
  const [groupOptions, setGroupOptions] = useState([]);
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

      const [colSnap, ownedRefsSnap, catalogSnap] = await Promise.all([
        get(dbRef(db, `users/${uid}/collections`)),
        get(dbRef(db, `users/${uid}/ownedItems`)),
        get(dbRef(db, "meta/groupCatalog")),
      ]);

      if (!alive) return;

      const colVal = colSnap.exists() ? colSnap.val() : {};
      const colList = Object.keys(colVal || {})
        .filter((k) => !k.startsWith("_"))
        .map((k) => ({ id: k, ...colVal[k] }));
      setCollections(colList);
      setSelectedCollectionId("");

      const owned = new Set();
      const ownedRefsVal = ownedRefsSnap.exists() ? ownedRefsSnap.val() : {};
      for (const key of Object.keys(ownedRefsVal || {})) {
        if (key.startsWith("_")) continue;
        owned.add(String(key));
      }
      setOwnedItemIds(Array.from(owned));

      const catalogVal = catalogSnap.exists() ? catalogSnap.val() : {};
      const groups = Object.values(catalogVal || {})
        .map((entry) => String(entry?.name || "").trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      setGroupOptions(groups);

    }

    load().catch((err) => setError(err?.message || "Could not load scan data."));
    return () => {
      alive = false;
    };
  }, []);

  async function fetchRecentBatch(beforeCreatedAt = null) {
    const constraints = [orderByChild("createdAt")];
    if (Number.isFinite(beforeCreatedAt)) {
      constraints.push(endAt(beforeCreatedAt));
    }
    constraints.push(limitToLast(SCAN_BATCH_SIZE));
    const itemSnap = await get(dbQuery(dbRef(db, "items"), ...constraints));
    const itemVal = itemSnap.exists() ? itemSnap.val() : {};
    return Object.keys(itemVal || {})
      .filter((k) => !k.startsWith("_"))
      .map((k) => ({ id: k, ...itemVal[k] }))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }

  async function fetchItemsForGroup(groupName) {
    const name = String(groupName || "").trim();
    if (!name) return [];
    const snap = await get(dbQuery(dbRef(db, "items"), orderByChild("group"), equalTo(name)));
    const val = snap.exists() ? snap.val() : {};
    return Object.keys(val || {})
      .filter((k) => !k.startsWith("_"))
      .map((k) => ({ id: k, ...val[k] }))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
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

      const [hash, centeredHash] = await Promise.all([
        computeAverageHashFromBlob(scanBlob, 16),
        computeCenteredAverageHashFromBlob(scanBlob, 16, 2 / 3),
      ]);

      const ownedSet = new Set(ownedItemIds.map((id) => String(id)));
      const ranked = [];
      const seenIds = new Set();
      const groupFilter = String(scanGroup || "").trim();
      const normalizedGroupFilter = normalize(groupFilter);
      let cursor = null;
      let batches = 0;
      let foundGoodMatch = false;

      const processBatch = (batch) => {
        if (!batch.length) return false;

        for (const item of batch) {
          const id = String(item.id || "").trim();
          if (!id || seenIds.has(id) || ownedSet.has(id)) continue;
          seenIds.add(id);
          if (normalizedGroupFilter && normalize(item.group) !== normalizedGroupFilter) continue;
          if (typeof item.imgHash !== "string" || !item.imgHash.length) continue;

          const distA = hammingDistance(hash, item.imgHash);
          const distB = hammingDistance(centeredHash, item.imgHash);
          const dist = Math.min(distA, distB);
          const similarity = similarityFromDistance(dist);
          if (similarity < MIN_MATCH_PERCENT) continue;

          ranked.push({
            ...item,
            dist,
            similarity,
          });
          foundGoodMatch = true;
        }

        ranked.sort((a, b) => b.similarity - a.similarity);
        if (ranked.length > 25) {
          ranked.splice(25);
        }
        return true;
      };

      if (groupFilter) {
        const allGroupItems = await fetchItemsForGroup(groupFilter);
        for (let start = 0; start < allGroupItems.length && batches < MAX_SCAN_BATCHES; start += SCAN_BATCH_SIZE) {
          const batch = allGroupItems.slice(start, start + SCAN_BATCH_SIZE);
          const hadBatch = processBatch(batch);
          if (!hadBatch) break;
          if (foundGoodMatch && ranked.length >= 3) break;
          batches += 1;
        }
      } else {
        while (batches < MAX_SCAN_BATCHES) {
          const batch = await fetchRecentBatch(cursor);
          if (!batch.length) break;
          processBatch(batch);
          if (foundGoodMatch && ranked.length >= 3) break;

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
      }

      setMatches(ranked.slice(0, 3));
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
      const ownedRefSnap = await get(dbRef(db, `users/${uid}/ownedItems/${item.id}`));
      if (ownedRefSnap.exists()) {
        setError("This photocard is already in your My Photocards.");
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
          Group filter (optional)
          <select value={scanGroup} onChange={(e) => setScanGroup(e.target.value)}>
            <option value="">All groups (slower)</option>
            {groupOptions.map((name) => (
              <option key={name} value={name}>
                {name}
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
              imagePath={item.imagePath}
              alt={item.title || "Photocard"}
              thumbOnly
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
