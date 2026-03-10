import { useMemo, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ref as dbRef, get, push, update, serverTimestamp } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../../firebase-config";
import { buildResizedPath, DEFAULT_CARD_THUMB_SIZE } from "../lib/imagePaths";
import { cropImageFileToBlob } from "../lib/imageCrop";
import Nav from "../components/Nav";

function normalize(str) {
  return String(str || "").trim().toLowerCase();
}

export default function SubmitPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [collections, setCollections] = useState([]);
  const [existingItems, setExistingItems] = useState([]);

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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isAlbumBased = rarity === "album" || rarity === "pob";

  useEffect(() => {
    let alive = true;

    async function loadInitialData() {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const [collectionSnap, globalItemsSnap] = await Promise.all([
        get(dbRef(db, `users/${uid}/collections`)),
        get(dbRef(db, "items")),
      ]);

      if (!alive) return;

      const colVal = collectionSnap.exists() ? collectionSnap.val() : {};
      const colList = Object.keys(colVal || {})
        .filter((k) => !k.startsWith("_"))
        .map((k) => ({ id: k, ...colVal[k] }));
      setCollections(colList);
      setSelectedCollectionId((prev) => prev || colList[0]?.id || "");

      const itemVal = globalItemsSnap.exists() ? globalItemsSnap.val() : {};
      const itemList = Object.keys(itemVal || {})
        .filter((k) => !k.startsWith("_"))
        .map((k) => ({ id: k, ...itemVal[k] }));
      setExistingItems(itemList);
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

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const uid = auth.currentUser?.uid;
    if (!uid) return setError("You must be logged in.");
    if (!selectedCollectionId) return setError("Select a collection.");
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
        collectionId: selectedCollectionId,
      };

      // Always publish to shared library so other users can find/add the card.
      updates[`items/${itemId}`] = base;

      await update(dbRef(db), updates);
      navigate(`/users/${uid}/collections/${selectedCollectionId}`);
    } catch (err) {
      setError(err?.message || "Could not upload photocard.");
    } finally {
      setLoading(false);
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
          Collection
          <select
            value={selectedCollectionId}
            onChange={(e) => setSelectedCollectionId(e.target.value)}
            required
          >
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
            value={group}
            onChange={(e) => {
              setGroup(e.target.value);
              setAlbumChoice("");
              setNewAlbumName("");
            }}
            placeholder="e.g. TWICE"
            required
          />
        </label>

        <label>
          Member
          <input
            value={member}
            onChange={(e) => setMember(e.target.value)}
            placeholder="e.g. Sana"
            required
          />
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
            <div className="crop-preview">
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

            <label>
              Zoom
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={cropZoom}
                onChange={(e) => setCropZoom(Number(e.target.value))}
                disabled={!cropEnabled}
              />
            </label>

            <label>
              Horizontal
              <input
                type="range"
                min="-260"
                max="260"
                step="1"
                value={cropX}
                onChange={(e) => setCropX(Number(e.target.value))}
                disabled={!cropEnabled}
              />
            </label>

            <label>
              Vertical
              <input
                type="range"
                min="-360"
                max="360"
                step="1"
                value={cropY}
                onChange={(e) => setCropY(Number(e.target.value))}
                disabled={!cropEnabled}
              />
            </label>
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
