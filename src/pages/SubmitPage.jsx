import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ref as dbRef, get, push, update, serverTimestamp } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../../firebase-config";
import { buildResizedPath, DEFAULT_CARD_THUMB_SIZE } from "../lib/imagePaths";
import { cropImageFileToBlob } from "../lib/imageCrop";
import { computeAverageHashFromBlob } from "../lib/imageHash";
import Nav from "../components/Nav";

function normalize(str) {
  return String(str || "").trim().toLowerCase();
}

export default function SubmitPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [collections, setCollections] = useState([]);
  const [existingItems, setExistingItems] = useState([]);
  const [groupCatalog, setGroupCatalog] = useState({});

  const [selectedCollectionId, setSelectedCollectionId] = useState(
    params.get("collectionId") || ""
  );

  const [rarity, setRarity] = useState("album");
  const [group, setGroup] = useState("");
  const [member, setMember] = useState("");
  const [albumChoice, setAlbumChoice] = useState("");
  const [newAlbumName, setNewAlbumName] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [pobStore, setPobStore] = useState("");
  const [version, setVersion] = useState("");

  const [photoFile, setPhotoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [cropEnabled, setCropEnabled] = useState(true);
  const [cropZoom, setCropZoom] = useState(1.15);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const dragRef = useRef(null);
  const pointersRef = useRef(new Map());
  const pinchRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isAlbumBased = rarity === "album" || rarity === "pob";

  useEffect(() => {
    let alive = true;

    async function loadInitialData() {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const [collectionSnap, globalItemsSnap, catalogSnap] = await Promise.all([
        get(dbRef(db, `users/${uid}/collections`)),
        get(dbRef(db, "items")),
        get(dbRef(db, "meta/groupCatalog")),
      ]);

      if (!alive) return;

      const colVal = collectionSnap.exists() ? collectionSnap.val() : {};
      const colList = Object.keys(colVal || {})
        .filter((k) => !k.startsWith("_"))
        .map((k) => ({ id: k, ...colVal[k] }));
      setCollections(colList);

      const itemVal = globalItemsSnap.exists() ? globalItemsSnap.val() : {};
      const itemList = Object.keys(itemVal || {})
        .filter((k) => !k.startsWith("_"))
        .map((k) => ({ id: k, ...itemVal[k] }));
      setExistingItems(itemList);

      const catalogVal = catalogSnap.exists() ? catalogSnap.val() : {};
      setGroupCatalog(catalogVal || {});
    }

    loadInitialData().catch((err) => setError(err?.message || "Could not load data."));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!photoFile) {
      setPreviewUrl("");
      return;
    }

    const url = URL.createObjectURL(photoFile);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [photoFile]);

  const albumOptions = useMemo(() => {
    const g = normalize(group);
    if (!g) return [];

    const set = new Set();
    for (const item of existingItems) {
      if (normalize(item.group) !== g) continue;
      const albumName = String(item.album || "").trim();
      if (albumName) set.add(albumName);
    }

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [existingItems, group]);

  const normalizedGroup = normalize(group);

  const groupOptions = useMemo(() => {
    const fromCatalog = Object.values(groupCatalog || {})
      .map((entry) => String(entry?.name || "").trim())
      .filter(Boolean);

    const fromItems = existingItems
      .map((item) => String(item.group || "").trim())
      .filter(Boolean);

    return Array.from(new Set([...fromCatalog, ...fromItems])).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [groupCatalog, existingItems]);

  const hasGroupInCatalog = useMemo(() => {
    if (!normalizedGroup) return false;
    return Object.keys(groupCatalog || {}).some((key) => normalize(key) === normalizedGroup);
  }, [groupCatalog, normalizedGroup]);

  const memberOptions = useMemo(() => {
    if (!normalizedGroup) return [];

    const matchedCatalogGroup = Object.keys(groupCatalog || {}).find(
      (key) => normalize(key) === normalizedGroup
    );
    const fromCatalog = matchedCatalogGroup
      ? Object.values(groupCatalog[matchedCatalogGroup]?.members || {})
          .map((m) => String(m || "").trim())
          .filter(Boolean)
      : [];

    const fromItems = existingItems
      .filter((item) => normalize(item.group) === normalizedGroup)
      .map((item) => String(item.member || "").trim())
      .filter(Boolean);

    return Array.from(new Set([...fromCatalog, ...fromItems])).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [groupCatalog, existingItems, normalizedGroup]);

  const hasMemberInCatalog = useMemo(() => {
    if (!normalizedGroup || !normalize(member)) return false;
    const matchedCatalogGroup = Object.keys(groupCatalog || {}).find(
      (key) => normalize(key) === normalizedGroup
    );
    if (!matchedCatalogGroup) return false;
    const members = Object.values(groupCatalog[matchedCatalogGroup]?.members || {}).map((m) =>
      normalize(m)
    );
    return members.includes(normalize(member));
  }, [groupCatalog, normalizedGroup, member]);

  const resolvedAlbum = useMemo(() => {
    if (!isAlbumBased) return "";
    if (albumChoice === "__new") return newAlbumName.trim();
    return albumChoice.trim();
  }, [isAlbumBased, albumChoice, newAlbumName]);

  const computedTitle = useMemo(() => {
    const person = member.trim();
    if (!person) return "";

    let descriptor = "";
    if (rarity === "album") {
      descriptor = resolvedAlbum || "Album photocard";
    } else if (rarity === "pob") {
      const base = resolvedAlbum || "Album";
      descriptor = `${base} POB${pobStore.trim() ? ` (${pobStore.trim()})` : ""}`;
    } else if (rarity === "event") {
      descriptor = sourceName.trim() ? `Event ${sourceName.trim()}` : "Event photocard";
    } else if (rarity === "broadcast") {
      descriptor = sourceName.trim()
        ? `Broadcast ${sourceName.trim()}`
        : "Broadcast photocard";
    } else if (rarity === "lucky-draw") {
      descriptor = sourceName.trim()
        ? `Lucky Draw ${sourceName.trim()}`
        : "Lucky Draw photocard";
    }

    return `${person} ${descriptor}`.trim();
  }, [member, rarity, resolvedAlbum, pobStore, sourceName]);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function distanceBetweenPointers(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function applyZoomChange(nextZoom) {
    setCropZoom(clamp(nextZoom, 1, 3));
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
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }

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
    applyZoomChange(cropZoom + (-e.deltaY * 0.0015));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const uid = auth.currentUser?.uid;
    if (!uid) return setError("You must be logged in.");
    if (!group.trim() || !member.trim()) {
      return setError("Group and member are required.");
    }
    if (!photoFile) return setError("Upload a photocard image.");
    if (isAlbumBased && !resolvedAlbum) {
      return setError("Select an existing album or create a new one.");
    }
    if (rarity === "pob" && !pobStore.trim()) {
      return setError("Please add the POB store.");
    }
    if (!computedTitle) {
      return setError("Could not build title. Check member and rarity fields.");
    }

    setLoading(true);

    try {
      const itemId = push(dbRef(db, "tmp")).key;

      let uploadBlob;
      let mimeType;
      let ext;

      if (cropEnabled) {
        uploadBlob = await cropImageFileToBlob(photoFile, {
          zoom: cropZoom,
          offsetX: cropX,
          offsetY: cropY,
        });
        mimeType = "image/jpeg";
        ext = "jpg";
      } else {
        uploadBlob = photoFile;
        mimeType = photoFile.type || "image/jpeg";
        ext = photoFile.name.split(".").pop()?.toLowerCase() || "jpg";
      }

      const imagePath = `users/${uid}/photocards/${itemId}.${ext}`;
      const thumbPath = buildResizedPath(imagePath, DEFAULT_CARD_THUMB_SIZE);
      const imageRef = storageRef(storage, imagePath);

      await uploadBytes(imageRef, uploadBlob, { contentType: mimeType });
      const imageUrl = await getDownloadURL(imageRef);
      const imgHash = await computeAverageHashFromBlob(uploadBlob, 16);

      const now = serverTimestamp();
      const base = {
        id: itemId,
        title: computedTitle,
        group: group.trim(),
        member: member.trim(),
        album: resolvedAlbum,
        rarity,
        sourceName: sourceName.trim(),
        pobStore: pobStore.trim(),
        version: version.trim(),
        imageUrl,
        imagePath,
        thumbPath,
        imgHash,
        createdBy: uid,
        createdAt: now,
        updatedAt: now,
      };

      const userItemRef = push(dbRef(db, `users/${uid}/collectionItems`));
      const userItemId = userItemRef.key;

      const updates = {};
      updates[`users/${uid}/collectionItems/${userItemId}`] = {
        ...base,
        id: userItemId,
        sourceItemId: itemId,
        collectionId: selectedCollectionId || "",
      };

      // Always publish to shared library so other users can find/add the card.
      updates[`items/${itemId}`] = base;

      await update(dbRef(db), updates);
      navigate(selectedCollectionId ? `/users/${uid}/collections/${selectedCollectionId}` : "/my-photocards");
    } catch (err) {
      setError(err?.message || "Could not upload photocard.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddGroupToList() {
    setError("");
    const name = group.trim();
    const key = normalize(name);
    if (!name) return;
    if (hasGroupInCatalog) return;

    try {
      await update(dbRef(db), {
        [`meta/groupCatalog/${key}/name`]: name,
        [`meta/groupCatalog/${key}/updatedAt`]: serverTimestamp(),
      });
      setGroupCatalog((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] || {}),
          name,
          updatedAt: Date.now(),
          members: prev[key]?.members || {},
        },
      }));
    } catch (err) {
      setError(err?.message || "Could not add group to list.");
    }
  }

  async function handleAddMemberToList() {
    setError("");
    const groupName = group.trim();
    const memberName = member.trim();
    const groupKey = normalize(groupName);
    const memberKey = normalize(memberName);

    if (!groupName || !memberName) return;
    if (hasMemberInCatalog) return;

    try {
      const updates = {
        [`meta/groupCatalog/${groupKey}/name`]: groupName,
        [`meta/groupCatalog/${groupKey}/members/${memberKey}`]: memberName,
        [`meta/groupCatalog/${groupKey}/updatedAt`]: serverTimestamp(),
      };
      await update(dbRef(db), updates);

      setGroupCatalog((prev) => ({
        ...prev,
        [groupKey]: {
          ...(prev[groupKey] || {}),
          name: groupName,
          updatedAt: Date.now(),
          members: {
            ...(prev[groupKey]?.members || {}),
            [memberKey]: memberName,
          },
        },
      }));
    } catch (err) {
      setError(err?.message || "Could not add member to list.");
    }
  }

  return (
    <main className="page-content with-nav-space submit-page">
      <section className="section-block">
        <h1>Add new photocard</h1>
        <p className="muted">
          If you cannot find the card in search, create it here. The card will be
          available for all users to add.
        </p>
      </section>

      <form className="form-grid add-photocard-form" onSubmit={handleSubmit}>
        <label>
          Rarity
          <select value={rarity} onChange={(e) => setRarity(e.target.value)}>
            <option value="album">Album</option>
            <option value="pob">POB</option>
            <option value="event">Event</option>
            <option value="broadcast">Broadcast</option>
            <option value="lucky-draw">Lucky Draw</option>
          </select>
        </label>

        <label>
          Collection (optional)
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
          Group
          <input
            list="group-options"
            value={group}
            onChange={(e) => {
              setGroup(e.target.value);
              setAlbumChoice("");
              setNewAlbumName("");
            }}
            placeholder="e.g. TWICE"
            required
          />
          <datalist id="group-options">
            {groupOptions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          {!hasGroupInCatalog && group.trim() ? (
            <button type="button" className="btn btn-ghost small" onClick={handleAddGroupToList}>
              Add group to list
            </button>
          ) : null}
        </label>

        <label>
          Member
          <input
            list="member-options"
            value={member}
            onChange={(e) => setMember(e.target.value)}
            placeholder="e.g. Sana"
            required
          />
          <datalist id="member-options">
            {memberOptions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          {!hasMemberInCatalog && group.trim() && member.trim() ? (
            <button type="button" className="btn btn-ghost small" onClick={handleAddMemberToList}>
              Add member to list
            </button>
          ) : null}
        </label>

        {isAlbumBased && (
          <label>
            Album
            <select
              value={albumChoice}
              onChange={(e) => setAlbumChoice(e.target.value)}
              required
            >
              <option value="">Select album</option>
              {albumOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              <option value="__new">+ Create new album</option>
            </select>
          </label>
        )}

        {isAlbumBased && albumChoice === "__new" && (
          <label>
            New album name
            <input
              value={newAlbumName}
              onChange={(e) => setNewAlbumName(e.target.value)}
              placeholder="e.g. Between 1&2"
              required
            />
          </label>
        )}

        {rarity === "pob" && (
          <label>
            POB store
            <input
              value={pobStore}
              onChange={(e) => setPobStore(e.target.value)}
              placeholder="e.g. Soundwave"
              required
            />
          </label>
        )}

        {(rarity === "event" || rarity === "broadcast" || rarity === "lucky-draw") && (
          <label>
            {rarity === "broadcast" ? "Broadcast name" : "Event / source name"}
            <input
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder={
                rarity === "broadcast"
                  ? "e.g. Music Bank"
                  : rarity === "event"
                    ? "e.g. Fanmeeting Seoul"
                    : "e.g. Soundwave round 2"
              }
            />
          </label>
        )}

        <label>
          Version
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="e.g. Pathfinder ver."
          />
        </label>

        <label>
          Generated title
          <input value={computedTitle} readOnly placeholder="Auto-generated" />
        </label>

        <label>
          Photocard image
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
            required
          />
        </label>

        {previewUrl && (
          <div className="crop-panel">
            <div
              className={`crop-preview ${isDraggingCrop ? "dragging" : ""}`}
              onPointerDown={handleCropPointerDown}
              onPointerMove={handleCropPointerMove}
              onPointerUp={handleCropPointerUp}
              onPointerCancel={handleCropPointerUp}
              onWheel={handleCropWheel}
            >
              <img
                src={previewUrl}
                alt="Crop preview"
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
              Crop to 3:4.5 card
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
        )}

        {error && <p className="error-text">{error}</p>}

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Saving..." : "Add photocard"}
        </button>
      </form>

      <Nav />
    </main>
  );
}
