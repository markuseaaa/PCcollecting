import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ref as dbRef, get, push, update, serverTimestamp } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../../firebase-config";
import { buildResizedPath, DEFAULT_CARD_THUMB_SIZE } from "../lib/imagePaths";
import { cropImageFileToBlob } from "../lib/imageCrop";
import { computeAverageHashFromBlob } from "../lib/imageHash";
import { DEFAULT_POB_STORES, formatPobStoreName } from "../lib/pobStore";
import StorageImage from "../components/StorageImage";
import Nav from "../components/Nav";

function normalize(str) {
  return String(str || "").trim().toLowerCase();
}

function toCatalogKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.#$/[\]]/g, "")
    .replace(/\s+/g, "-");
}

function findCatalogGroupKey(catalog, groupValue) {
  const needle = normalize(groupValue);
  const needleKey = toCatalogKey(groupValue);
  if (!needle) return "";

  const entries = Object.entries(catalog || {});
  const byKey = entries.find(
    ([key]) => normalize(key) === needle || toCatalogKey(key) === needleKey
  );
  if (byKey) return byKey[0];

  const byName = entries.find(
    ([, value]) =>
      normalize(value?.name) === needle || toCatalogKey(value?.name) === needleKey
  );
  return byName ? byName[0] : "";
}

function dedupeNamesCaseInsensitive(values) {
  const canonical = new Map();
  for (const raw of values) {
    const name = String(raw || "").trim();
    if (!name) continue;
    const key = normalize(name);
    if (!key) continue;
    if (!canonical.has(key)) {
      canonical.set(key, name);
    }
  }
  return Array.from(canonical.values()).sort((a, b) => a.localeCompare(b));
}

export default function SubmitPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [collections, setCollections] = useState([]);
  const [existingItems, setExistingItems] = useState([]);
  const [groupCatalog, setGroupCatalog] = useState({});
  const [pobStoreCatalog, setPobStoreCatalog] = useState({});

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
  const [otherType, setOtherType] = useState("");
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
  const cropPreviewRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [duplicateCandidate, setDuplicateCandidate] = useState(null);
  const [duplicateLoading, setDuplicateLoading] = useState(false);

  const isAlbumRequired = rarity === "album" || rarity === "pob" || rarity === "lucky-draw";
  const supportsAlbumLink = isAlbumRequired || rarity === "pop-up";

  useEffect(() => {
    let alive = true;

    async function loadInitialData() {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const [collectionSnap, globalItemsSnap, catalogSnap, pobStoreSnap] = await Promise.all([
        get(dbRef(db, `users/${uid}/collections`)),
        get(dbRef(db, "items")),
        get(dbRef(db, "meta/groupCatalog")),
        get(dbRef(db, "meta/pobStoreCatalog")),
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
      const pobStoreVal = pobStoreSnap.exists() ? pobStoreSnap.val() : {};
      setPobStoreCatalog(pobStoreVal || {});
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

  useEffect(() => {
    if (rarity === "pob") setVersion("");
    if (rarity !== "others") setOtherType("");
  }, [rarity]);

  const normalizedGroup = normalize(group);
  const matchedCatalogGroupKey = useMemo(
    () => findCatalogGroupKey(groupCatalog, group),
    [groupCatalog, group]
  );

  const selectedCatalogGroup = matchedCatalogGroupKey
    ? groupCatalog[matchedCatalogGroupKey] || {}
    : null;
  const membersLocked = Boolean(selectedCatalogGroup?.membersLocked);

  const albumOptions = useMemo(() => {
    if (!normalizedGroup) return [];

    const fromCatalog = matchedCatalogGroupKey
      ? Object.values(groupCatalog[matchedCatalogGroupKey]?.albums || {})
          .map((a) => String(a || "").trim())
          .filter(Boolean)
      : [];

    const fromItems = existingItems
      .filter((item) => normalize(item.group) === normalizedGroup)
      .map((item) => String(item.album || "").trim())
      .filter(Boolean);

    return dedupeNamesCaseInsensitive([...fromCatalog, ...fromItems]);
  }, [existingItems, normalizedGroup, groupCatalog, matchedCatalogGroupKey]);

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
    return Boolean(matchedCatalogGroupKey);
  }, [normalizedGroup, matchedCatalogGroupKey]);

  const groupSuggestions = useMemo(() => {
    if (!normalizedGroup) return groupOptions.slice(0, 8);
    return groupOptions
      .filter((name) => normalize(name).includes(normalizedGroup))
      .slice(0, 8);
  }, [groupOptions, normalizedGroup]);

  const memberOptions = useMemo(() => {
    if (!normalizedGroup) return [];
    const fromCatalog = matchedCatalogGroupKey
      ? Object.values(groupCatalog[matchedCatalogGroupKey]?.members || {})
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
  }, [groupCatalog, existingItems, normalizedGroup, matchedCatalogGroupKey]);

  const hasMemberInCatalog = useMemo(() => {
    if (!normalizedGroup || !normalize(member)) return false;
    if (!matchedCatalogGroupKey) return false;
    const members = Object.values(groupCatalog[matchedCatalogGroupKey]?.members || {}).map((m) =>
      normalize(m)
    );
    return members.includes(normalize(member));
  }, [groupCatalog, normalizedGroup, member, matchedCatalogGroupKey]);

  const normalizedMember = normalize(member);

  const memberSuggestions = useMemo(() => {
    if (!normalizedGroup) return [];
    if (!normalizedMember) return memberOptions;
    const filtered = memberOptions.filter((name) => normalize(name).includes(normalizedMember));
    return filtered.length > 0 ? filtered : memberOptions;
  }, [memberOptions, normalizedGroup, normalizedMember]);

  const versionOptions = useMemo(() => {
    if (!normalizedGroup) return [];
    const albumNorm = normalize(resolvedAlbum);
    const albumScoped = supportsAlbumLink && Boolean(albumNorm);

    const fromCatalogAlbumScoped =
      albumScoped && matchedCatalogGroupKey
        ? Object.values(
            groupCatalog[matchedCatalogGroupKey]?.albumVersions?.[toCatalogKey(resolvedAlbum)] || {}
          )
            .map((v) => String(v || "").trim())
            .filter(Boolean)
        : [];

    const fromCatalogGroup =
      !supportsAlbumLink && matchedCatalogGroupKey
        ? Object.values(groupCatalog[matchedCatalogGroupKey]?.versions || {})
            .map((v) => String(v || "").trim())
            .filter(Boolean)
        : [];

    const fromItems = existingItems
      .filter((item) => {
        if (normalize(item.group) !== normalizedGroup) return false;
        if (!supportsAlbumLink) return true;
        if (!albumNorm) return false;
        return normalize(item.album) === albumNorm;
      })
      .map((item) => String(item.version || "").trim())
      .filter(Boolean);

    return dedupeNamesCaseInsensitive([
      ...fromCatalogAlbumScoped,
      ...fromCatalogGroup,
      ...fromItems,
    ]);
  }, [
    groupCatalog,
    existingItems,
    normalizedGroup,
    matchedCatalogGroupKey,
    resolvedAlbum,
    supportsAlbumLink,
  ]);

  const normalizedVersion = normalize(version);
  const hasVersionInCatalog = useMemo(() => {
    if (!normalizedGroup || !normalizedVersion || !matchedCatalogGroupKey) return false;
    const versions = Object.values(groupCatalog[matchedCatalogGroupKey]?.versions || {}).map((v) =>
      normalize(v)
    );
    return versions.includes(normalizedVersion);
  }, [groupCatalog, matchedCatalogGroupKey, normalizedGroup, normalizedVersion]);

  const versionSuggestions = useMemo(() => {
    if (!normalizedGroup) return [];
    if (!normalizedVersion) return versionOptions.slice(0, 12);
    return versionOptions
      .filter((name) => normalize(name).includes(normalizedVersion))
      .slice(0, 12);
  }, [versionOptions, normalizedGroup, normalizedVersion]);

  const pobStoreOptions = useMemo(() => {
    const fromCatalog = Object.values(pobStoreCatalog || {})
      .map((value) => formatPobStoreName(value))
      .filter(Boolean);
    const fromItems = existingItems
      .map((item) => formatPobStoreName(item.pobStore))
      .filter(Boolean);
    return Array.from(new Set([...DEFAULT_POB_STORES, ...fromCatalog, ...fromItems])).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [pobStoreCatalog, existingItems]);

  const normalizedPobStore = normalize(pobStore);
  const hasPobStoreInCatalog = useMemo(() => {
    if (!normalizedPobStore) return false;
    return pobStoreOptions.some((name) => normalize(name) === normalizedPobStore);
  }, [pobStoreOptions, normalizedPobStore]);

  const pobStoreSuggestions = useMemo(() => {
    if (!normalizedPobStore) return pobStoreOptions.slice(0, 8);
    return pobStoreOptions
      .filter((name) => normalize(name).includes(normalizedPobStore))
      .slice(0, 8);
  }, [pobStoreOptions, normalizedPobStore]);

  const resolvedAlbum = useMemo(() => {
    if (!supportsAlbumLink) return "";
    if (albumChoice === "__new") return newAlbumName.trim();
    return albumChoice.trim();
  }, [supportsAlbumLink, albumChoice, newAlbumName]);

  const computedTitle = useMemo(() => {
    const person = member.trim();
    if (!person) return "";

    let descriptor = "";
    if (rarity === "album") {
      descriptor = resolvedAlbum || "Album photocard";
    } else if (rarity === "pob") {
      const base = resolvedAlbum || "Album";
      const store = formatPobStoreName(pobStore);
      descriptor = `${base} POB${store ? ` (${store})` : ""}`;
    } else if (rarity === "broadcast") {
      descriptor = sourceName.trim()
        ? `Broadcast ${sourceName.trim()}`
        : "Broadcast photocard";
    } else if (rarity === "lucky-draw") {
      const base = resolvedAlbum || "Album";
      descriptor = sourceName.trim()
        ? `${base} Lucky Draw ${sourceName.trim()}`
        : `${base} Lucky Draw photocard`;
    } else if (rarity === "concert") {
      descriptor = sourceName.trim() ? `Concert ${sourceName.trim()}` : "Concert photocard";
    } else if (rarity === "pop-up") {
      const base = resolvedAlbum ? `${resolvedAlbum} ` : "";
      descriptor = sourceName.trim()
        ? `${base}Pop-Up ${sourceName.trim()}`
        : `${base}Pop-Up photocard`;
    } else if (rarity === "seasons-greetings") {
      descriptor = sourceName.trim()
        ? `Seasons Greetings ${sourceName.trim()}`
        : "Seasons Greetings photocard";
    } else if (rarity === "fanclub") {
      descriptor = sourceName.trim() ? `Fanclub ${sourceName.trim()}` : "Fanclub photocard";
    } else if (rarity === "others") {
      descriptor = otherType.trim()
        ? `${otherType.trim()}${sourceName.trim() ? ` ${sourceName.trim()}` : ""}`
        : "Other photocard";
    }

    return `${person} ${descriptor}`.trim();
  }, [member, rarity, resolvedAlbum, pobStore, sourceName, otherType]);

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

  async function addExistingPhotocard(uid, match) {
    const currentItemsSnap = await get(dbRef(db, `users/${uid}/collectionItems`));
    if (currentItemsSnap.exists()) {
      let alreadyOwned = false;
      currentItemsSnap.forEach((ch) => {
        const val = ch.val() || {};
        if (val.sourceItemId === match.id || ch.key === match.id) {
          alreadyOwned = true;
          return true;
        }
        return false;
      });
      if (alreadyOwned) {
        throw new Error("You already have this photocard in My Photocards.");
      }
    }

    const userItemRef = push(dbRef(db, `users/${uid}/collectionItems`));
    const userItemId = userItemRef.key;
    const now = serverTimestamp();
    const updates = {};
    updates[`users/${uid}/collectionItems/${userItemId}`] = {
      id: userItemId,
      sourceItemId: match.id,
      collectionId: selectedCollectionId || "",
      title: match.title || "",
      group: match.group || "",
      member: match.member || "",
      album: match.album || "",
      rarity: match.rarity || "",
      sourceName: match.sourceName || "",
      pobStore: match.pobStore || "",
      otherType: match.otherType || "",
      version: match.version || "",
      imageUrl: match.imageUrl || "",
      imagePath: match.imagePath || "",
      thumbPath: match.thumbPath || "",
      imgHash: match.imgHash || "",
      createdAt: now,
      updatedAt: now,
    };
    updates[`users/${uid}/collectionItems/_placeholder`] = true;
    await update(dbRef(db), updates);
    navigate(selectedCollectionId ? `/users/${uid}/collections/${selectedCollectionId}` : "/my-photocards");
  }

  async function createNewPhotocard(uid) {
    if (!photoFile) return setError("Upload a photocard image.");

    setLoading(true);

    try {
      const itemId = push(dbRef(db, "tmp")).key;

      let uploadBlob;
      let mimeType;
      let ext;

      if (cropEnabled) {
        const previewRect = cropPreviewRef.current?.getBoundingClientRect();
        uploadBlob = await cropImageFileToBlob(photoFile, {
          zoom: cropZoom,
          offsetX: cropX,
          offsetY: cropY,
          previewWidth: previewRect?.width || 0,
          previewHeight: previewRect?.height || 0,
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

      const formattedPobStore = formatPobStoreName(pobStore);
      const now = serverTimestamp();
      const base = {
        id: itemId,
        title: computedTitle,
        group: group.trim(),
        member: member.trim(),
        album: resolvedAlbum,
        rarity,
        sourceName: sourceName.trim(),
        pobStore: formattedPobStore,
        otherType: otherType.trim(),
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
      if (resolvedAlbum && group.trim()) {
        const groupKey = matchedCatalogGroupKey || toCatalogKey(group.trim());
        const albumKey = toCatalogKey(resolvedAlbum);
        if (groupKey && albumKey) {
          updates[`meta/groupCatalog/${groupKey}/name`] =
            groupCatalog[groupKey]?.name || group.trim();
          updates[`meta/groupCatalog/${groupKey}/albums/${albumKey}`] = resolvedAlbum;
        }
      }
      if (version.trim() && group.trim()) {
        const groupKey = matchedCatalogGroupKey || toCatalogKey(group.trim());
        const versionName = version.trim();
        const versionKey = toCatalogKey(versionName);
        if (groupKey && versionKey) {
          updates[`meta/groupCatalog/${groupKey}/name`] =
            groupCatalog[groupKey]?.name || group.trim();
          updates[`meta/groupCatalog/${groupKey}/versions/${versionKey}`] = versionName;
          if (resolvedAlbum) {
            const albumKey = toCatalogKey(resolvedAlbum);
            if (albumKey) {
              updates[`meta/groupCatalog/${groupKey}/albumVersions/${albumKey}/${versionKey}`] =
                versionName;
            }
          }
        }
      }

      await update(dbRef(db), updates);
      navigate(selectedCollectionId ? `/users/${uid}/collections/${selectedCollectionId}` : "/my-photocards");
    } catch (err) {
      setError(err?.message || "Could not upload photocard.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const uid = auth.currentUser?.uid;
    if (!uid) return setError("You must be logged in.");
    if (!group.trim() || !member.trim()) {
      return setError("Group and member are required.");
    }
    if (isAlbumRequired && !resolvedAlbum) {
      return setError("Select an existing album or create a new one.");
    }
    if (membersLocked && !hasMemberInCatalog) {
      return setError("This group's member list is locked. Choose a member from the list.");
    }
    if (rarity === "pob" && !pobStore.trim()) {
      return setError("Please add the POB store.");
    }
    if (rarity === "others" && !otherType.trim()) {
      return setError("Please add what type this card is.");
    }
    if (!computedTitle) {
      return setError("Could not build title. Check member and rarity fields.");
    }

    const normalizedInput = {
      group: normalize(group),
      member: normalize(member),
      album: normalize(resolvedAlbum),
      rarity: normalize(rarity),
      sourceName: normalize(sourceName),
      pobStore: normalize(formatPobStoreName(pobStore)),
      version: normalize(version),
      otherType: normalize(otherType),
    };

    const exactMatches = existingItems.filter((item) => {
      return (
        normalize(item.group) === normalizedInput.group &&
        normalize(item.member) === normalizedInput.member &&
        normalize(item.album) === normalizedInput.album &&
        normalize(item.rarity) === normalizedInput.rarity &&
        normalize(item.sourceName) === normalizedInput.sourceName &&
        normalize(item.pobStore) === normalizedInput.pobStore &&
        normalize(item.version) === normalizedInput.version &&
        normalize(item.otherType) === normalizedInput.otherType
      );
    });

    if (exactMatches.length > 0) {
      setDuplicateCandidate(exactMatches[0]);
      return;
    }

    await createNewPhotocard(uid);
  }

  async function handleUseExistingDuplicate() {
    const uid = auth.currentUser?.uid;
    if (!uid || !duplicateCandidate) return;
    setDuplicateLoading(true);
    setError("");
    try {
      await addExistingPhotocard(uid, duplicateCandidate);
      setDuplicateCandidate(null);
    } catch (err) {
      setError(err?.message || "Could not add existing photocard.");
    } finally {
      setDuplicateLoading(false);
    }
  }

  async function handleCreateDuplicateAnyway() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setDuplicateLoading(true);
    setError("");
    try {
      await createNewPhotocard(uid);
      setDuplicateCandidate(null);
    } finally {
      setDuplicateLoading(false);
    }
  }

  async function handleAddGroupToList() {
    setError("");
    const name = group.trim();
    const key = toCatalogKey(name);
    if (!name) return;
    if (!key) return setError("Invalid group name.");
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
          albums: prev[key]?.albums || {},
          versions: prev[key]?.versions || {},
          membersLocked: Boolean(prev[key]?.membersLocked),
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
    const groupKey = toCatalogKey(groupName);
    const memberKey = toCatalogKey(memberName);

    if (!groupName || !memberName) return;
    if (!groupKey || !memberKey) return setError("Invalid group/member value.");
    if (hasMemberInCatalog) return;
    if (membersLocked) return setError("Members are locked for this group.");

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
          albums: {
            ...(prev[groupKey]?.albums || {}),
          },
          versions: {
            ...(prev[groupKey]?.versions || {}),
          },
        },
      }));
    } catch (err) {
      setError(err?.message || "Could not add member to list.");
    }
  }

  async function handleAddVersionToList() {
    setError("");
    const groupName = group.trim();
    const versionName = version.trim();
    const groupKey = matchedCatalogGroupKey || toCatalogKey(groupName);
    const versionKey = toCatalogKey(versionName);

    if (!groupName || !versionName) return;
    if (!groupKey || !versionKey) return setError("Invalid group/version value.");
    if (hasVersionInCatalog) return;

    try {
      const updates = {
        [`meta/groupCatalog/${groupKey}/name`]: groupName,
        [`meta/groupCatalog/${groupKey}/versions/${versionKey}`]: versionName,
        [`meta/groupCatalog/${groupKey}/updatedAt`]: serverTimestamp(),
      };
      if (resolvedAlbum) {
        const albumKey = toCatalogKey(resolvedAlbum);
        if (albumKey) {
          updates[`meta/groupCatalog/${groupKey}/albumVersions/${albumKey}/${versionKey}`] =
            versionName;
        }
      }
      await update(dbRef(db), updates);

      setGroupCatalog((prev) => ({
        ...prev,
        [groupKey]: {
          ...(prev[groupKey] || {}),
          name: groupName,
          updatedAt: Date.now(),
          members: {
            ...(prev[groupKey]?.members || {}),
          },
          albums: {
            ...(prev[groupKey]?.albums || {}),
          },
          versions: {
            ...(prev[groupKey]?.versions || {}),
            [versionKey]: versionName,
          },
          albumVersions: resolvedAlbum
            ? {
                ...(prev[groupKey]?.albumVersions || {}),
                [toCatalogKey(resolvedAlbum)]: {
                  ...(prev[groupKey]?.albumVersions?.[toCatalogKey(resolvedAlbum)] || {}),
                  [versionKey]: versionName,
                },
              }
            : {
                ...(prev[groupKey]?.albumVersions || {}),
              },
        },
      }));
    } catch (err) {
      setError(err?.message || "Could not add version to list.");
    }
  }

  async function handleAddPobStoreToList() {
    setError("");
    const name = formatPobStoreName(pobStore);
    const key = toCatalogKey(name);
    if (!name) return;
    if (!key) return setError("Invalid POB store name.");
    if (hasPobStoreInCatalog) return;

    try {
      await update(dbRef(db), {
        [`meta/pobStoreCatalog/${key}`]: name,
      });
      setPobStoreCatalog((prev) => ({
        ...prev,
        [key]: name,
      }));
      setPobStore(name);
    } catch (err) {
      setError(err?.message || "Could not add POB store.");
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
            <option value="concert">Concert</option>
            <option value="broadcast">Broadcast</option>
            <option value="lucky-draw">Lucky Draw</option>
            <option value="pop-up">Pop-Up</option>
            <option value="seasons-greetings">Seasons Greetings</option>
            <option value="fanclub">Fanclub</option>
            <option value="others">Others</option>
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
            value={group}
            onChange={(e) => {
              setGroup(e.target.value);
              setAlbumChoice("");
              setNewAlbumName("");
            }}
            placeholder="e.g. TWICE"
            required
          />
          {groupSuggestions.length > 0 ? (
            <div className="option-list">
              {groupSuggestions.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="option-chip"
                  onClick={() => setGroup(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          ) : null}
          {!hasGroupInCatalog && group.trim() ? (
            <button type="button" className="btn btn-ghost small" onClick={handleAddGroupToList}>
              Add group to list
            </button>
          ) : null}
        </label>

        <label>
          Member
          <input
            value={member}
            onChange={(e) => setMember(e.target.value)}
            placeholder={membersLocked ? "Pick from suggestions below" : "e.g. Sana"}
            readOnly={membersLocked}
            required
          />
          {memberSuggestions.length > 0 ? (
            <div className="option-list">
              {memberSuggestions.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="option-chip"
                  onClick={() => setMember(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          ) : null}
          {!membersLocked && !hasMemberInCatalog && group.trim() && member.trim() ? (
            <button type="button" className="btn btn-ghost small" onClick={handleAddMemberToList}>
              Add member to list
            </button>
          ) : null}
        </label>

        {supportsAlbumLink && (
          <label>
            Album {rarity === "pop-up" ? "(optional)" : ""}
            <select
              value={albumChoice}
              onChange={(e) => setAlbumChoice(e.target.value)}
              required={isAlbumRequired}
            >
              <option value="">{isAlbumRequired ? "Select album" : "No linked album"}</option>
              {albumOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              <option value="__new">+ Create new album</option>
            </select>
          </label>
        )}

        {supportsAlbumLink && albumChoice === "__new" && (
          <label>
            New album name
            <input
              value={newAlbumName}
              onChange={(e) => setNewAlbumName(e.target.value)}
              placeholder="e.g. Between 1&2"
              required={isAlbumRequired}
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
            {pobStoreSuggestions.length > 0 ? (
              <div className="option-list">
                {pobStoreSuggestions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="option-chip"
                    onClick={() => setPobStore(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : null}
            {!hasPobStoreInCatalog && pobStore.trim() ? (
              <button type="button" className="btn btn-ghost small" onClick={handleAddPobStoreToList}>
                Add POB store to list
              </button>
            ) : null}
          </label>
        )}

        {(rarity === "broadcast" ||
          rarity === "concert" ||
          rarity === "lucky-draw" ||
          rarity === "pop-up" ||
          rarity === "seasons-greetings" ||
          rarity === "fanclub") && (
          <label>
            {rarity === "broadcast"
              ? "Broadcast name"
              : rarity === "concert"
                ? "Concert name"
              : rarity === "lucky-draw"
                ? "Lucky Draw source"
                : rarity === "pop-up"
                  ? "Pop-Up source"
                  : rarity === "seasons-greetings"
                    ? "Seasons Greetings source"
                    : "Fanclub source"}
            <input
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder={
                rarity === "broadcast"
                  ? "e.g. Music Bank"
                  : rarity === "concert"
                    ? "e.g. World Tour Seoul"
                  : rarity === "lucky-draw"
                    ? "e.g. Soundwave round 2"
                    : rarity === "pop-up"
                      ? "e.g. Seoul pop-up store"
                      : rarity === "seasons-greetings"
                        ? "e.g. 2026 package"
                        : "e.g. 4th gen fanclub"
              }
            />
          </label>
        )}

        {rarity === "others" && (
          <>
            <label>
              Other type
              <input
                value={otherType}
                onChange={(e) => setOtherType(e.target.value)}
                placeholder="e.g. Anniversary merch"
                required
              />
            </label>
            <label>
              Source (optional)
              <input
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder="e.g. Offline event booth"
              />
            </label>
          </>
        )}

        {rarity !== "pob" && (
          <label>
            Version
            <input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="e.g. Pathfinder ver."
            />
            {versionSuggestions.length > 0 ? (
              <div className="option-list">
                {versionSuggestions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="option-chip"
                    onClick={() => setVersion(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : null}
            {!hasVersionInCatalog && group.trim() && version.trim() ? (
              <button type="button" className="btn btn-ghost small" onClick={handleAddVersionToList}>
                Add version to list
              </button>
            ) : null}
          </label>
        )}

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
              ref={cropPreviewRef}
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

      {duplicateCandidate ? (
        <div className="modal-backdrop" onClick={() => setDuplicateCandidate(null)}>
          <section className="modal-card" onClick={(ev) => ev.stopPropagation()}>
            <h2>Possible Duplicate Found</h2>
            <p className="muted">
              We found a photocard with the same information. Is this the same card?
            </p>

            <article className="photo-card static">
              <StorageImage
                src={duplicateCandidate.imageUrl || duplicateCandidate.coverImage || ""}
                thumbPath={duplicateCandidate.thumbPath}
                alt={duplicateCandidate.title || "Photocard"}
              />
              <div>
                <p className="photo-title">{duplicateCandidate.title || "Untitled"}</p>
                <p className="photo-meta">
                  {duplicateCandidate.group || "Unknown group"} - {duplicateCandidate.member || "Unknown"}
                </p>
                <p className="photo-meta">
                  {duplicateCandidate.album || duplicateCandidate.sourceName || "Unknown source"}
                </p>
              </div>
            </article>

            <div className="center-action">
              <button
                type="button"
                className="btn btn-primary small"
                onClick={handleUseExistingDuplicate}
                disabled={duplicateLoading}
              >
                Use existing photocard
              </button>
              <button
                type="button"
                className="btn btn-ghost small"
                onClick={handleCreateDuplicateAnyway}
                disabled={duplicateLoading}
              >
                Add as new anyway
              </button>
              <button
                type="button"
                className="btn btn-ghost small"
                onClick={() => setDuplicateCandidate(null)}
                disabled={duplicateLoading}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <Nav />
    </main>
  );
}
