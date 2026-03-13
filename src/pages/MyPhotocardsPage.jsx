import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { ref, get, remove } from "firebase/database";
import { auth, db } from "../../firebase-config";
import { formatRarityLabel } from "../lib/rarity";
import { cropImageFileToBlob } from "../lib/imageCrop";
import {
  computeAverageHashFromBlob,
  computeCenteredAverageHashFromBlob,
  hammingDistance,
} from "../lib/imageHash";
import {
  getCachedCollectionItems,
  getCachedCollections,
  removeCachedCollectionItem,
  setCachedCollectionItems,
  setCachedCollections,
} from "../lib/userDataCache";
import StorageImage from "../components/StorageImage";
import Nav from "../components/Nav";

function norm(value) {
  return String(value || "").trim().toLowerCase();
}

const MIN_MATCH_PERCENT = 60;

export default function MyPhotocardsPage() {
  const [items, setItems] = useState([]);
  const [collectionMap, setCollectionMap] = useState({});
  const [query, setQuery] = useState("");
  const [memberFilter, setMemberFilter] = useState("");
  const [albumFilter, setAlbumFilter] = useState("");
  const [rarityFilter, setRarityFilter] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [removingId, setRemovingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkOpen, setCheckOpen] = useState(false);
  const [checkFile, setCheckFile] = useState(null);
  const [checkPreviewUrl, setCheckPreviewUrl] = useState("");
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [checkMatches, setCheckMatches] = useState([]);
  const [checkMessage, setCheckMessage] = useState("");
  const [checkCropEnabled, setCheckCropEnabled] = useState(true);
  const [checkCropZoom, setCheckCropZoom] = useState(1.15);
  const [checkCropX, setCheckCropX] = useState(0);
  const [checkCropY, setCheckCropY] = useState(0);
  const [isDraggingCheckCrop, setIsDraggingCheckCrop] = useState(false);
  const checkCropPreviewRef = useRef(null);
  const checkDragRef = useRef(null);
  const checkPointersRef = useRef(new Map());
  const checkPinchRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(24);

  useEffect(() => {
    let alive = true;

    async function load() {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setError("You must be logged in.");
        setLoading(false);
        return;
      }

      try {
        const cachedItems = getCachedCollectionItems(uid);
        const cachedCollections = getCachedCollections(uid);
        if (cachedItems && cachedCollections) {
          setItems(cachedItems);
          const cachedMap = {};
          for (const entry of cachedCollections) {
            const key = String(entry?.id || "");
            if (!key) continue;
            cachedMap[key] = entry?.title || "Untitled";
          }
          setCollectionMap(cachedMap);
          setLoading(false);
          return;
        }

        const [itemSnap, collectionSnap] = await Promise.all([
          get(ref(db, `users/${uid}/collectionItems`)),
          get(ref(db, `users/${uid}/collections`)),
        ]);

        if (!alive) return;

        const rawItems = itemSnap.exists() ? itemSnap.val() : {};
        const list = Object.keys(rawItems || {})
          .filter((k) => !k.startsWith("_"))
          .map((k) => ({ id: k, ...rawItems[k] }));
        setItems(list);
        setCachedCollectionItems(uid, list);

        const rawCollections = collectionSnap.exists() ? collectionSnap.val() : {};
        const map = {};
        const collectionList = [];
        for (const key of Object.keys(rawCollections || {})) {
          if (key.startsWith("_")) continue;
          map[key] = rawCollections[key]?.title || "Untitled";
          collectionList.push({ id: key, ...rawCollections[key] });
        }
        setCollectionMap(map);
        setCachedCollections(uid, collectionList);
      } catch (err) {
        if (!alive) return;
        setError(err?.message || "Could not load your photocards.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!checkFile) {
      setCheckPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(checkFile);
    setCheckPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [checkFile]);

  const memberOptions = useMemo(() => {
    const vals = new Set(items.map((item) => String(item.member || "").trim()).filter(Boolean));
    return Array.from(vals).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const albumOptions = useMemo(() => {
    const vals = new Set(items.map((item) => String(item.album || "").trim()).filter(Boolean));
    return Array.from(vals).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const rarityOptions = useMemo(() => {
    const vals = new Set(items.map((item) => formatRarityLabel(item.rarity)).filter(Boolean));
    return Array.from(vals).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredAndSorted = useMemo(() => {
    const term = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const matchesSearch =
        !term ||
        `${item.title || ""} ${item.group || ""} ${item.member || ""} ${item.album || ""} ${item.rarity || ""} ${item.version || ""} ${item.sourceName || ""} ${item.pobStore || ""} ${item.otherType || ""}`
          .toLowerCase()
          .includes(term);
      const matchesMember = !memberFilter || norm(item.member) === norm(memberFilter);
      const matchesAlbum = !albumFilter || norm(item.album) === norm(albumFilter);
      const matchesRarity = !rarityFilter || norm(formatRarityLabel(item.rarity)) === norm(rarityFilter);

      return matchesSearch && matchesMember && matchesAlbum && matchesRarity;
    });

    filtered.sort((a, b) => {
      if (sortBy === "oldest") {
        return Number(a.createdAt || 0) - Number(b.createdAt || 0);
      }
      if (sortBy === "member_az") {
        return String(a.member || "").localeCompare(String(b.member || ""));
      }
      if (sortBy === "album_az") {
        return String(a.album || "").localeCompare(String(b.album || ""));
      }
      if (sortBy === "rarity_az") {
        return formatRarityLabel(a.rarity).localeCompare(formatRarityLabel(b.rarity));
      }
      return Number(b.createdAt || 0) - Number(a.createdAt || 0);
    });

    return filtered;
  }, [
    items,
    query,
    memberFilter,
    albumFilter,
    rarityFilter,
    sortBy,
  ]);

  const visibleItems = useMemo(
    () => filteredAndSorted.slice(0, visibleCount),
    [filteredAndSorted, visibleCount]
  );

  useEffect(() => {
    setVisibleCount(24);
  }, [query, memberFilter, albumFilter, rarityFilter, sortBy]);

  async function handleRemove(itemId) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    if (!window.confirm("Remove this photocard from your collection?")) return;

    setRemovingId(itemId);
    try {
      await remove(ref(db, `users/${uid}/collectionItems/${itemId}`));
      setItems((prev) => prev.filter((item) => item.id !== itemId));
      removeCachedCollectionItem(uid, itemId);
    } catch (err) {
      setError(err?.message || "Could not remove photocard.");
    } finally {
      setRemovingId("");
    }
  }

  function similarityFromDistance(distance, maxBits = 256) {
    if (!Number.isFinite(distance)) return 0;
    return Math.max(0, Math.round((1 - distance / maxBits) * 100));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function applyCheckZoomChange(nextZoom) {
    setCheckCropZoom(clamp(nextZoom, 1, 3));
  }

  function distanceBetweenPointers(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function handleCheckCropPointerDown(e) {
    if (!checkCropEnabled) return;
    checkPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    checkDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: checkCropX,
      baseY: checkCropY,
    };
    setIsDraggingCheckCrop(true);
    e.currentTarget.setPointerCapture(e.pointerId);

    if (checkPointersRef.current.size === 2) {
      const [p1, p2] = [...checkPointersRef.current.values()];
      checkPinchRef.current = {
        startDistance: distanceBetweenPointers(p1, p2),
        baseZoom: checkCropZoom,
      };
      setIsDraggingCheckCrop(false);
    }
  }

  function handleCheckCropPointerMove(e) {
    if (!checkCropEnabled) return;
    if (checkPointersRef.current.has(e.pointerId)) {
      checkPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (checkPointersRef.current.size >= 2 && checkPinchRef.current) {
      const [p1, p2] = [...checkPointersRef.current.values()];
      const currentDistance = distanceBetweenPointers(p1, p2);
      const ratio = currentDistance / checkPinchRef.current.startDistance;
      applyCheckZoomChange(checkPinchRef.current.baseZoom * ratio);
      return;
    }

    const drag = checkDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setCheckCropX(clamp(drag.baseX + dx, -260, 260));
    setCheckCropY(clamp(drag.baseY + dy, -360, 360));
  }

  function handleCheckCropPointerUp(e) {
    checkPointersRef.current.delete(e.pointerId);
    if (checkPointersRef.current.size < 2) checkPinchRef.current = null;

    const drag = checkDragRef.current;
    if (drag && drag.pointerId === e.pointerId) {
      checkDragRef.current = null;
      setIsDraggingCheckCrop(false);
    }

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function handleCheckCropWheel(e) {
    if (!checkCropEnabled) return;
    e.preventDefault();
    applyCheckZoomChange(checkCropZoom + -e.deltaY * 0.0015);
  }

  async function handleCheck() {
    setCheckError("");
    setCheckMatches([]);
    setCheckMessage("");
    if (!checkFile) return setCheckError("Upload or take a photo first.");

    const candidates = items.filter(
      (item) => typeof item.imgHash === "string" && item.imgHash.length > 0
    );
    if (candidates.length === 0) {
      return setCheckError("No hash data found on your cards yet.");
    }

    setCheckLoading(true);
    try {
      let checkBlob = checkFile;
      if (checkCropEnabled) {
        const previewRect = checkCropPreviewRef.current?.getBoundingClientRect();
        checkBlob = await cropImageFileToBlob(checkFile, {
          zoom: checkCropZoom,
          offsetX: checkCropX,
          offsetY: checkCropY,
          previewWidth: previewRect?.width || 0,
          previewHeight: previewRect?.height || 0,
        });
      }

      const [hashA, hashB] = await Promise.all([
        computeAverageHashFromBlob(checkBlob, 16),
        computeCenteredAverageHashFromBlob(checkBlob, 16, 2 / 3),
      ]);

      const ranked = candidates
        .map((item) => {
          const distA = hammingDistance(hashA, item.imgHash);
          const distB = hammingDistance(hashB, item.imgHash);
          const dist = Math.min(distA, distB);
          return {
            ...item,
            similarity: similarityFromDistance(dist),
          };
        })
        .sort((a, b) => b.similarity - a.similarity);

      const topMatches = ranked.slice(0, 3).filter((item) => item.similarity >= MIN_MATCH_PERCENT);
      if (topMatches.length === 0) {
        setCheckMessage("No reliable match found in your photocards.");
        return;
      }

      setCheckMatches(topMatches);
      setCheckMessage(`We found ${topMatches.length} possible matches in your photocards.`);
    } catch (err) {
      setCheckError(err?.message || "Could not check this image.");
    } finally {
      setCheckLoading(false);
    }
  }

  function closeCheckModal() {
    setCheckOpen(false);
    setCheckFile(null);
    setCheckPreviewUrl("");
    setCheckLoading(false);
    setCheckError("");
    setCheckMatches([]);
    setCheckMessage("");
    setCheckCropEnabled(true);
    setCheckCropZoom(1.15);
    setCheckCropX(0);
    setCheckCropY(0);
  }

  const uid = auth.currentUser?.uid;

  return (
    <main className="page-content with-nav-space">
      <section className="section-heading-row">
        <div>
          <h1>My Photocards</h1>
          <p className="muted">All your cards across every collection.</p>
        </div>
        <button type="button" className="btn btn-primary small" onClick={() => setCheckOpen(true)}>
          Check
        </button>
      </section>

      <section className="section-block">
        <label className="search-label">
          Search cards
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="member, album, type, title"
          />
        </label>

        <div className="filters-grid">
          <label>
            Member
            <select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)}>
              <option value="">All</option>
              {memberOptions.map((member) => (
                <option key={member} value={member}>
                  {member}
                </option>
              ))}
            </select>
          </label>

          <label>
            Album
            <select value={albumFilter} onChange={(e) => setAlbumFilter(e.target.value)}>
              <option value="">All</option>
              {albumOptions.map((album) => (
                <option key={album} value={album}>
                  {album}
                </option>
              ))}
            </select>
          </label>

          <label>
            Type
            <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value)}>
              <option value="">All</option>
              {rarityOptions.map((rarity) => (
                <option key={rarity} value={rarity}>
                  {rarity}
                </option>
              ))}
            </select>
          </label>

          <label>
            Sort
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="member_az">Member A-Z</option>
              <option value="album_az">Album A-Z</option>
              <option value="rarity_az">Type A-Z</option>
            </select>
          </label>
        </div>
      </section>

      {loading && <p className="muted">Loading your cards...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && filteredAndSorted.length === 0 ? (
        <div className="empty-state">
          <h2>No matches</h2>
          <p>Try changing your filters or add more cards.</p>
        </div>
      ) : null}

      <div className="card-grid">
        {visibleItems.map((item) => (
          <article key={item.id} className="photo-card static">
            <Link
              to={
                item.collectionId
                  ? `/users/${uid}/collections/${item.collectionId}/items/${item.id}`
                  : `/items/${item.id}`
              }
              className="photo-card-link"
            >
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
                  {item.group || "Unknown group"} - {item.member || "Unknown member"}
                </p>
                <p className="photo-meta">
                  {item.album || item.sourceName || "Unknown source"}
                  {item.rarity ? ` • ${formatRarityLabel(item.rarity)}` : ""}
                </p>
                <p className="photo-meta">
                  Collection: {item.collectionId ? (collectionMap[item.collectionId] || "Unknown") : "Unassigned"}
                </p>
              </div>
            </Link>
            <div className="card-actions">
              <button
                type="button"
                className="btn btn-ghost small danger-btn"
                onClick={() => handleRemove(item.id)}
                disabled={removingId === item.id}
              >
                {removingId === item.id ? "Removing..." : "Remove"}
              </button>
            </div>
          </article>
        ))}
      </div>

      {!loading && visibleItems.length < filteredAndSorted.length ? (
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

      {checkOpen ? (
        <div className="modal-backdrop" onClick={closeCheckModal}>
          <section className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="section-heading-row">
              <h2>Check photocard</h2>
              <button type="button" className="btn btn-ghost small" onClick={closeCheckModal}>
                Close
              </button>
            </div>

            <label>
              Scan image
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  setCheckFile(e.target.files?.[0] || null);
                  setCheckMatches([]);
                  setCheckError("");
                  setCheckMessage("");
                }}
              />
            </label>

            {checkPreviewUrl ? (
              <div className="crop-panel">
                <div
                  className={`crop-preview ${isDraggingCheckCrop ? "dragging" : ""}`}
                  ref={checkCropPreviewRef}
                  onPointerDown={handleCheckCropPointerDown}
                  onPointerMove={handleCheckCropPointerMove}
                  onPointerUp={handleCheckCropPointerUp}
                  onPointerCancel={handleCheckCropPointerUp}
                  onWheel={handleCheckCropWheel}
                >
                  <img
                    src={checkPreviewUrl}
                    alt="Check preview"
                    style={{
                      transform: `translate(${checkCropX}px, ${checkCropY}px) scale(${checkCropZoom})`,
                    }}
                  />
                </div>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={checkCropEnabled}
                    onChange={(e) => setCheckCropEnabled(e.target.checked)}
                  />
                  Crop before checking
                </label>

                <div className="crop-controls">
                  <button
                    type="button"
                    className="btn btn-ghost small"
                    onClick={() => applyCheckZoomChange(checkCropZoom - 0.1)}
                    disabled={!checkCropEnabled}
                  >
                    -
                  </button>
                  <span className="crop-zoom-label">Zoom {checkCropZoom.toFixed(2)}x</span>
                  <button
                    type="button"
                    className="btn btn-ghost small"
                    onClick={() => applyCheckZoomChange(checkCropZoom + 0.1)}
                    disabled={!checkCropEnabled}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost small"
                    onClick={() => {
                      setCheckCropZoom(1.15);
                      setCheckCropX(0);
                      setCheckCropY(0);
                    }}
                    disabled={!checkCropEnabled}
                  >
                    Reset
                  </button>
                </div>
                <p className="crop-hint muted">Drag to move. Pinch or scroll to zoom.</p>
              </div>
            ) : null}

            <div className="center-action">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCheck}
                disabled={!checkFile || checkLoading}
              >
                {checkLoading ? "Checking..." : "Check if I already have it"}
              </button>
            </div>

            {checkError ? <p className="error-text">{checkError}</p> : null}
            {checkMessage ? <p className="muted">{checkMessage}</p> : null}

            {checkMatches.length > 0 ? (
              <div className="check-results-grid">
                {checkMatches.map((match) => (
                  <article key={match.id} className="photo-card static check-result-card">
                    <Link
                      to={
                        match.collectionId
                          ? `/users/${uid}/collections/${match.collectionId}/items/${match.id}`
                          : `/items/${match.id}`
                      }
                      className="photo-card-link"
                      onClick={closeCheckModal}
                    >
                      <StorageImage
                        src={match.imageUrl || match.coverImage || ""}
                        thumbPath={match.thumbPath}
                        imagePath={match.imagePath}
                        alt={match.title || "Photocard"}
                        thumbOnly
                      />
                      <div>
                        <p className="photo-title">{match.title || "Untitled"}</p>
                        <p className="photo-meta">Match: {match.similarity}%</p>
                      </div>
                    </Link>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
