import { useEffect, useMemo, useState } from "react";
import { ref, get, update } from "firebase/database";
import { serverTimestamp } from "firebase/database";
import { deleteObject, ref as storageRef } from "firebase/storage";
import { auth, db, storage } from "../../firebase-config";
import { hasAdminClaim } from "../lib/adminAuth";
import { formatRarityLabel } from "../lib/rarity";
import StorageImage from "../components/StorageImage";
import Nav from "../components/Nav";

const EDIT_FIELDS = [
  "title",
  "group",
  "member",
  "album",
  "rarity",
  "version",
  "sourceName",
  "pobStore",
  "otherType",
];

function normalize(v) {
  return String(v || "").trim().toLowerCase();
}

function toCatalogKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.#$/[\]]/g, "")
    .replace(/\s+/g, "-");
}

async function deleteStoragePathIfExists(path) {
  const cleaned = String(path || "").trim();
  if (!cleaned) return;

  try {
    await deleteObject(storageRef(storage, cleaned));
  } catch (err) {
    const code = String(err?.code || "");
    if (code === "storage/object-not-found") return;
    throw err;
  }
}

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [items, setItems] = useState([]);
  const [groupCatalog, setGroupCatalog] = useState({});
  const [query, setQuery] = useState("");
  const [groupInput, setGroupInput] = useState("");
  const [groupNameInput, setGroupNameInput] = useState("");
  const [memberInput, setMemberInput] = useState("");
  const [albumInput, setAlbumInput] = useState("");
  const [versionInput, setVersionInput] = useState("");
  const [editingAlbumKey, setEditingAlbumKey] = useState("");
  const [editingAlbumName, setEditingAlbumName] = useState("");
  const [selectedGroupKey, setSelectedGroupKey] = useState("");
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [visibleCount, setVisibleCount] = useState(40);

  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState({
    title: "",
    group: "",
    member: "",
    album: "",
    rarity: "",
    version: "",
    sourceName: "",
    pobStore: "",
    otherType: "",
  });

  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      const user = auth.currentUser;
      if (!user) {
        setError("You must be logged in.");
        setLoading(false);
        return;
      }

      try {
        const admin = await hasAdminClaim(user);
        if (!alive) return;
        setIsAdmin(admin);
        if (!admin) {
          setError("Access denied. Admin claim required.");
          setLoading(false);
          return;
        }

        const [itemSnap, catalogSnap] = await Promise.all([
          get(ref(db, "items")),
          get(ref(db, "meta/groupCatalog")),
        ]);
        const val = itemSnap.exists() ? itemSnap.val() : {};
        const list = Object.keys(val || {})
          .filter((k) => !k.startsWith("_"))
          .map((k) => ({ id: k, ...val[k] }))
          .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));

        if (!alive) return;
        setItems(list);

        const catalogVal = catalogSnap.exists() ? catalogSnap.val() : {};
        setGroupCatalog(catalogVal || {});
        const firstKey = Object.keys(catalogVal || {})[0] || "";
        setSelectedGroupKey(firstKey);
        setGroupNameInput(catalogVal?.[firstKey]?.name || "");
      } catch (err) {
        if (!alive) return;
        setError(err?.message || "Could not load admin data.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const term = normalize(query);
    if (!term) return items;
    return items.filter((item) =>
      normalize(
        `${item.title || ""} ${item.group || ""} ${item.member || ""} ${item.album || ""} ${item.rarity || ""} ${item.version || ""} ${item.sourceName || ""} ${item.pobStore || ""} ${item.otherType || ""}`
      ).includes(term)
    );
  }, [items, query]);

  const visibleItems = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  );

  useEffect(() => {
    setVisibleCount(40);
  }, [query]);

  const sortedGroupEntries = useMemo(() => {
    return Object.entries(groupCatalog || {}).sort((a, b) =>
      String(a[1]?.name || a[0]).localeCompare(String(b[1]?.name || b[0]))
    );
  }, [groupCatalog]);

  const groupCardCounts = useMemo(() => {
    const counts = {};
    for (const item of items) {
      const groupName = String(item.group || "").trim();
      if (!groupName) continue;
      const normalizedGroup = normalize(groupName);
      const matchedEntry = sortedGroupEntries.find(([key, value]) => {
        return normalize(key) === normalizedGroup || normalize(value?.name) === normalizedGroup;
      });
      const bucket = matchedEntry ? matchedEntry[0] : normalizedGroup;
      counts[bucket] = (counts[bucket] || 0) + 1;
    }
    return counts;
  }, [items, sortedGroupEntries]);

  const selectedGroup = useMemo(() => {
    if (!selectedGroupKey) return null;
    return groupCatalog[selectedGroupKey] || null;
  }, [groupCatalog, selectedGroupKey]);

  const selectedMembers = useMemo(() => {
    return Object.entries(selectedGroup?.members || {}).sort((a, b) =>
      String(a[1] || "").localeCompare(String(b[1] || ""))
    );
  }, [selectedGroup]);
  const selectedMembersLocked = Boolean(selectedGroup?.membersLocked);

  const selectedAlbums = useMemo(() => {
    if (!selectedGroupKey && !selectedGroup?.name) return [];

    const keyNorm = normalize(selectedGroupKey);
    const nameNorm = normalize(selectedGroup?.name || "");

    const merged = new Map();
    for (const [albumKey, albumName] of Object.entries(selectedGroup?.albums || {})) {
      const name = String(albumName || "").trim();
      if (!name) continue;
      merged.set(albumKey, { key: albumKey, name, inCatalog: true });
    }

    for (const item of items) {
      const itemGroup = normalize(item.group);
      const groupMatch = itemGroup && (itemGroup === keyNorm || itemGroup === nameNorm);
      if (!groupMatch) continue;

      const albumName = String(item.album || "").trim();
      if (!albumName) continue;
      const derivedKey = toCatalogKey(albumName);
      if (!merged.has(derivedKey)) {
        merged.set(derivedKey, { key: derivedKey, name: albumName, inCatalog: false });
      }
    }

    return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedGroup, selectedGroupKey, items]);

  const selectedVersions = useMemo(() => {
    return Object.entries(selectedGroup?.versions || {})
      .map(([key, name]) => ({ key, name: String(name || "").trim() }))
      .filter((entry) => entry.name)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedGroup]);

  function startEdit(item) {
    setEditingId(item.id);
    setForm({
      title: item.title || "",
      group: item.group || "",
      member: item.member || "",
      album: item.album || "",
      rarity: item.rarity || "",
      version: item.version || "",
      sourceName: item.sourceName || "",
      pobStore: item.pobStore || "",
      otherType: item.otherType || "",
    });
  }

  async function buildPropagationUpdates(itemIdOrIds, patch, mode, fields = EDIT_FIELDS) {
    const usersSnap = await get(ref(db, "users"));
    const updates = {};
    const sourceIds = Array.isArray(itemIdOrIds) ? itemIdOrIds : [itemIdOrIds];
    const sourceSet = new Set(sourceIds.filter(Boolean));
    if (sourceSet.size === 0) return updates;

    usersSnap.forEach((userCh) => {
      const uid = userCh.key;
      const collItemsCh = userCh.child("collectionItems");
      if (!collItemsCh.exists()) return;

      collItemsCh.forEach((itemCh) => {
        const val = itemCh.val() || {};
        const isMatch = sourceSet.has(val.sourceItemId) || sourceSet.has(itemCh.key);
        if (!isMatch) return;

        const userItemPath = `users/${uid}/collectionItems/${itemCh.key}`;
        if (mode === "delete") {
          updates[userItemPath] = null;
        } else {
          for (const field of fields) {
            updates[`${userItemPath}/${field}`] = patch[field] ?? "";
          }
          updates[`${userItemPath}/updatedAt`] = serverTimestamp();
        }
      });
    });

    return updates;
  }

  async function handleSave(itemId) {
    if (!itemId) return;
    setSaving(true);
    setError("");

    try {
      const patch = {
        title: form.title.trim(),
        group: form.group.trim(),
        member: form.member.trim(),
        album: form.album.trim(),
        rarity: form.rarity.trim(),
        version: form.version.trim(),
        sourceName: form.sourceName.trim(),
        pobStore: form.pobStore.trim(),
        otherType: form.otherType.trim(),
      };

      const updates = {};
      for (const field of EDIT_FIELDS) {
        updates[`items/${itemId}/${field}`] = patch[field];
      }
      updates[`items/${itemId}/updatedAt`] = serverTimestamp();

      const propagated = await buildPropagationUpdates(itemId, patch, "edit");
      Object.assign(updates, propagated);

      await update(ref(db), updates);

      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, ...patch, updatedAt: Date.now() }
            : item
        )
      );
      setEditingId("");
    } catch (err) {
      setError(err?.message || "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(itemId) {
    if (!window.confirm("Delete this photocard globally? This removes it for all users.")) {
      return;
    }

    setRemovingId(itemId);
    setError("");

    try {
      const target = items.find((item) => item.id === itemId);
      const imagePath = target?.imagePath || "";
      const thumbPath = target?.thumbPath || "";

      const updates = {
        [`items/${itemId}`]: null,
      };

      const propagated = await buildPropagationUpdates(itemId, {}, "delete");
      Object.assign(updates, propagated);

      await Promise.all([
        deleteStoragePathIfExists(imagePath),
        deleteStoragePathIfExists(thumbPath),
      ]);

      await update(ref(db), updates);
      setItems((prev) => prev.filter((item) => item.id !== itemId));
      if (editingId === itemId) setEditingId("");
    } catch (err) {
      setError(err?.message || "Could not delete photocard.");
    } finally {
      setRemovingId("");
    }
  }

  async function handleAddGroup() {
    setError("");
    const name = groupInput.trim();
    const key = toCatalogKey(name);
    if (!name) return;
    if (!key) return;
    if (groupCatalog[key]) {
      setSelectedGroupKey(key);
      return;
    }

    setCatalogSaving(true);
    try {
      await update(ref(db), {
        [`meta/groupCatalog/${key}/name`]: name,
        [`meta/groupCatalog/${key}/updatedAt`]: serverTimestamp(),
      });

      setGroupCatalog((prev) => ({
        ...prev,
        [key]: {
          name,
          members: {},
          albums: {},
          versions: {},
          membersLocked: false,
          updatedAt: Date.now(),
        },
      }));
      setSelectedGroupKey(key);
      setGroupNameInput(name);
      setGroupInput("");
    } catch (err) {
      setError(err?.message || "Could not add group.");
    } finally {
      setCatalogSaving(false);
    }
  }

  async function handleAddMember() {
    setError("");
    const groupKey = selectedGroupKey || toCatalogKey(groupInput);
    const memberName = memberInput.trim();
    const memberKey = toCatalogKey(memberName);
    if (!groupKey || !memberName || !memberKey) return;
    if (groupCatalog[groupKey]?.membersLocked) {
      setError("Members are locked for this group.");
      return;
    }

    const groupName = groupCatalog[groupKey]?.name || groupInput.trim() || groupKey;

    setCatalogSaving(true);
    try {
      await update(ref(db), {
        [`meta/groupCatalog/${groupKey}/name`]: groupName,
        [`meta/groupCatalog/${groupKey}/members/${memberKey}`]: memberName,
        [`meta/groupCatalog/${groupKey}/updatedAt`]: serverTimestamp(),
      });

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
          membersLocked: Boolean(prev[groupKey]?.membersLocked),
        },
      }));
      setSelectedGroupKey(groupKey);
      setMemberInput("");
      setGroupInput("");
    } catch (err) {
      setError(err?.message || "Could not add member.");
    } finally {
      setCatalogSaving(false);
    }
  }

  async function handleRenameSelectedGroup() {
    setError("");
    const nextName = groupNameInput.trim();
    if (!selectedGroupKey || !nextName) return;

    setCatalogSaving(true);
    try {
      await update(ref(db), {
        [`meta/groupCatalog/${selectedGroupKey}/name`]: nextName,
        [`meta/groupCatalog/${selectedGroupKey}/updatedAt`]: serverTimestamp(),
      });

      setGroupCatalog((prev) => ({
        ...prev,
        [selectedGroupKey]: {
          ...(prev[selectedGroupKey] || {}),
          name: nextName,
          updatedAt: Date.now(),
        },
      }));
    } catch (err) {
      setError(err?.message || "Could not rename group.");
    } finally {
      setCatalogSaving(false);
    }
  }

  async function handleToggleMembersLock() {
    if (!selectedGroupKey) return;
    setError("");
    setCatalogSaving(true);
    const nextLocked = !selectedMembersLocked;
    try {
      await update(ref(db), {
        [`meta/groupCatalog/${selectedGroupKey}/membersLocked`]: nextLocked,
        [`meta/groupCatalog/${selectedGroupKey}/updatedAt`]: serverTimestamp(),
      });
      setGroupCatalog((prev) => ({
        ...prev,
        [selectedGroupKey]: {
          ...(prev[selectedGroupKey] || {}),
          membersLocked: nextLocked,
          updatedAt: Date.now(),
        },
      }));
    } catch (err) {
      setError(err?.message || "Could not update member lock.");
    } finally {
      setCatalogSaving(false);
    }
  }

  async function handleRemoveMember(memberKey) {
    if (!selectedGroupKey || !memberKey) return;
    setError("");
    setCatalogSaving(true);
    try {
      await update(ref(db), {
        [`meta/groupCatalog/${selectedGroupKey}/members/${memberKey}`]: null,
        [`meta/groupCatalog/${selectedGroupKey}/updatedAt`]: serverTimestamp(),
      });

      setGroupCatalog((prev) => {
        const nextMembers = { ...(prev[selectedGroupKey]?.members || {}) };
        delete nextMembers[memberKey];
        return {
          ...prev,
          [selectedGroupKey]: {
            ...(prev[selectedGroupKey] || {}),
            members: nextMembers,
            updatedAt: Date.now(),
          },
        };
      });
    } catch (err) {
      setError(err?.message || "Could not remove member.");
    } finally {
      setCatalogSaving(false);
    }
  }

  async function handleAddAlbum(nameOverride = "") {
    setError("");
    const albumName = String(nameOverride || albumInput).trim();
    const albumKey = toCatalogKey(albumName);
    if (!selectedGroupKey || !albumName || !albumKey) return;

    setCatalogSaving(true);
    try {
      await update(ref(db), {
        [`meta/groupCatalog/${selectedGroupKey}/albums/${albumKey}`]: albumName,
        [`meta/groupCatalog/${selectedGroupKey}/updatedAt`]: serverTimestamp(),
      });

      setGroupCatalog((prev) => ({
        ...prev,
        [selectedGroupKey]: {
          ...(prev[selectedGroupKey] || {}),
          albums: {
            ...(prev[selectedGroupKey]?.albums || {}),
            [albumKey]: albumName,
          },
          updatedAt: Date.now(),
        },
      }));
      if (!nameOverride) setAlbumInput("");
    } catch (err) {
      setError(err?.message || "Could not add album.");
    } finally {
      setCatalogSaving(false);
    }
  }

  async function handleRenameAlbum() {
    setError("");
    const oldKey = editingAlbumKey;
    const newName = editingAlbumName.trim();
    const newKey = toCatalogKey(newName);
    if (!selectedGroupKey || !oldKey || !newName || !newKey) return;
    const oldName = String(selectedGroup?.albums?.[oldKey] || "").trim();
    const normalizedOldAlbum = normalize(oldName);
    const normalizedGroupKey = normalize(selectedGroupKey);
    const normalizedGroupName = normalize(selectedGroup?.name || "");

    setCatalogSaving(true);
    try {
      const updates = {
        [`meta/groupCatalog/${selectedGroupKey}/updatedAt`]: serverTimestamp(),
      };
      if (oldKey !== newKey) {
        updates[`meta/groupCatalog/${selectedGroupKey}/albums/${oldKey}`] = null;
      }
      updates[`meta/groupCatalog/${selectedGroupKey}/albums/${newKey}`] = newName;
      const matchedItemIds = [];
      for (const item of items) {
        const groupNorm = normalize(item.group);
        const albumNorm = normalize(item.album);
        const groupMatch =
          groupNorm && (groupNorm === normalizedGroupKey || groupNorm === normalizedGroupName);
        if (!groupMatch || !normalizedOldAlbum || albumNorm !== normalizedOldAlbum) continue;
        matchedItemIds.push(item.id);
        updates[`items/${item.id}/album`] = newName;
        updates[`items/${item.id}/updatedAt`] = serverTimestamp();
      }

      if (matchedItemIds.length > 0) {
        const propagated = await buildPropagationUpdates(
          matchedItemIds,
          { album: newName },
          "edit",
          ["album"]
        );
        Object.assign(updates, propagated);
      }

      await update(ref(db), updates);

      setGroupCatalog((prev) => {
        const nextAlbums = { ...(prev[selectedGroupKey]?.albums || {}) };
        if (oldKey !== newKey) delete nextAlbums[oldKey];
        nextAlbums[newKey] = newName;
        return {
          ...prev,
          [selectedGroupKey]: {
            ...(prev[selectedGroupKey] || {}),
            albums: nextAlbums,
            updatedAt: Date.now(),
          },
        };
      });
      if (matchedItemIds.length > 0) {
        setItems((prev) =>
          prev.map((item) =>
            matchedItemIds.includes(item.id) ? { ...item, album: newName, updatedAt: Date.now() } : item
          )
        );
      }

      setEditingAlbumKey("");
      setEditingAlbumName("");
    } catch (err) {
      setError(err?.message || "Could not rename album.");
    } finally {
      setCatalogSaving(false);
    }
  }

  async function handleRemoveAlbum(albumKey) {
    if (!selectedGroupKey || !albumKey) return;
    setError("");
    setCatalogSaving(true);
    try {
      await update(ref(db), {
        [`meta/groupCatalog/${selectedGroupKey}/albums/${albumKey}`]: null,
        [`meta/groupCatalog/${selectedGroupKey}/updatedAt`]: serverTimestamp(),
      });

      setGroupCatalog((prev) => {
        const nextAlbums = { ...(prev[selectedGroupKey]?.albums || {}) };
        delete nextAlbums[albumKey];
        return {
          ...prev,
          [selectedGroupKey]: {
            ...(prev[selectedGroupKey] || {}),
            albums: nextAlbums,
            updatedAt: Date.now(),
          },
        };
      });
    } catch (err) {
      setError(err?.message || "Could not remove album.");
    } finally {
      setCatalogSaving(false);
    }
  }

  async function handleAddVersion() {
    setError("");
    const versionName = versionInput.trim();
    const versionKey = toCatalogKey(versionName);
    if (!selectedGroupKey || !versionName || !versionKey) return;

    setCatalogSaving(true);
    try {
      await update(ref(db), {
        [`meta/groupCatalog/${selectedGroupKey}/versions/${versionKey}`]: versionName,
        [`meta/groupCatalog/${selectedGroupKey}/updatedAt`]: serverTimestamp(),
      });

      setGroupCatalog((prev) => ({
        ...prev,
        [selectedGroupKey]: {
          ...(prev[selectedGroupKey] || {}),
          versions: {
            ...(prev[selectedGroupKey]?.versions || {}),
            [versionKey]: versionName,
          },
          updatedAt: Date.now(),
        },
      }));
      setVersionInput("");
    } catch (err) {
      setError(err?.message || "Could not add version.");
    } finally {
      setCatalogSaving(false);
    }
  }

  async function handleRemoveVersion(versionKey) {
    if (!selectedGroupKey || !versionKey) return;
    setError("");
    setCatalogSaving(true);
    try {
      await update(ref(db), {
        [`meta/groupCatalog/${selectedGroupKey}/versions/${versionKey}`]: null,
        [`meta/groupCatalog/${selectedGroupKey}/updatedAt`]: serverTimestamp(),
      });

      setGroupCatalog((prev) => {
        const nextVersions = { ...(prev[selectedGroupKey]?.versions || {}) };
        delete nextVersions[versionKey];
        return {
          ...prev,
          [selectedGroupKey]: {
            ...(prev[selectedGroupKey] || {}),
            versions: nextVersions,
            updatedAt: Date.now(),
          },
        };
      });
    } catch (err) {
      setError(err?.message || "Could not remove version.");
    } finally {
      setCatalogSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="page-content with-nav-space">
        <p className="muted">Loading admin panel...</p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="page-content with-nav-space">
        <section className="section-block">
          <h1>Admin</h1>
          <p className="error-text">{error || "Access denied."}</p>
        </section>
        <Nav />
      </main>
    );
  }

  return (
    <main className="page-content with-nav-space">
      <section className="section-heading-row">
        <div>
          <h1>Admin</h1>
          <p className="muted">Edit or remove any photocard in the global database.</p>
        </div>
      </section>

      <section className="stats-grid">
        <article className="stat-card">
          <p className="stat-label">Total photocards added</p>
          <p className="stat-value">{items.length}</p>
        </article>
      </section>

      <section className="section-block">
        <label className="search-label">
          Search all cards
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="title, group, member, album"
          />
        </label>
        {error && <p className="error-text">{error}</p>}
      </section>

      <section className="section-block">
        <h2>Group, Member & Album List</h2>
        <p className="muted">Manage group names, members, and album options shown when adding cards.</p>

        <div className="form-grid compact">
          <label>
            Group name
            <input
              value={groupInput}
              onChange={(e) => setGroupInput(e.target.value)}
              placeholder="e.g. TWICE"
            />
          </label>
          <div className="center-action">
            <button
              type="button"
              className="btn btn-ghost small"
              onClick={handleAddGroup}
              disabled={catalogSaving || !groupInput.trim()}
            >
              Add group
            </button>
          </div>

          <label>
            Select group
            <select
              value={selectedGroupKey}
              onChange={(e) => {
                const nextKey = e.target.value;
                setSelectedGroupKey(nextKey);
                setGroupNameInput(groupCatalog[nextKey]?.name || "");
              }}
            >
              <option value="">Choose group</option>
              {sortedGroupEntries.map(([key, value]) => (
                <option key={key} value={key}>
                  {value?.name || key}
                </option>
              ))}
            </select>
          </label>
          <label>
            Member name
            <input
              value={memberInput}
              onChange={(e) => setMemberInput(e.target.value)}
              placeholder="e.g. Sana"
            />
          </label>
          <label>
            Album name
            <input
              value={albumInput}
              onChange={(e) => setAlbumInput(e.target.value)}
              placeholder="e.g. Between 1&2"
            />
          </label>
          <label>
            Version name
            <input
              value={versionInput}
              onChange={(e) => setVersionInput(e.target.value)}
              placeholder="e.g. Pathfinder ver."
            />
          </label>
        </div>

        <div className="center-action">
          <button
            type="button"
            className="btn btn-primary small"
            onClick={handleAddMember}
            disabled={
              catalogSaving ||
              !(selectedGroupKey || groupInput.trim()) ||
              !memberInput.trim() ||
              selectedMembersLocked
            }
          >
            Add member
          </button>
          <button
            type="button"
            className="btn btn-ghost small"
            onClick={handleAddAlbum}
            disabled={catalogSaving || !selectedGroupKey || !albumInput.trim()}
          >
            Add album
          </button>
          <button
            type="button"
            className="btn btn-ghost small"
            onClick={handleAddVersion}
            disabled={catalogSaving || !selectedGroupKey || !versionInput.trim()}
          >
            Add version
          </button>
        </div>

        {selectedGroupKey ? (
          <>
            <div className="form-grid compact">
              <label>
                Group display name
                <input
                  value={groupNameInput}
                  onChange={(e) => setGroupNameInput(e.target.value)}
                  placeholder="Group name"
                />
              </label>
              <div className="center-action">
                <button
                  type="button"
                  className="btn btn-ghost small"
                  onClick={handleRenameSelectedGroup}
                  disabled={catalogSaving || !groupNameInput.trim()}
                >
                  Save group name
                </button>
                <button
                  type="button"
                  className="btn btn-ghost small"
                  onClick={handleToggleMembersLock}
                  disabled={catalogSaving}
                >
                  {selectedMembersLocked ? "Unlock members" : "Lock members"}
                </button>
              </div>
            </div>
            {selectedMembersLocked ? (
              <p className="muted">Members are locked. Users can only pick members already in this list.</p>
            ) : null}

            <h3>Members in selected group</h3>
            {selectedMembers.length === 0 ? <p className="muted">No members yet.</p> : null}
            <ul className="member-list">
              {selectedMembers.map(([memberKey, memberName]) => (
                <li key={memberKey}>
                  <span>{memberName}</span>
                  <button
                    type="button"
                    className="btn btn-ghost small"
                    onClick={() => handleRemoveMember(memberKey)}
                    disabled={catalogSaving}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>

            <h3>Albums in selected group</h3>
            {selectedAlbums.length === 0 ? <p className="muted">No albums yet.</p> : null}
            <ul className="member-list">
              {selectedAlbums.map((album) => (
                <li key={album.key}>
                  <span>
                    {album.name}
                    {!album.inCatalog ? " (from items)" : ""}
                  </span>
                  {album.inCatalog ? (
                    <div className="center-action">
                      <button
                        type="button"
                        className="btn btn-ghost small"
                        onClick={() => {
                          setEditingAlbumKey(album.key);
                          setEditingAlbumName(album.name);
                        }}
                        disabled={catalogSaving}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost small"
                        onClick={() => handleRemoveAlbum(album.key)}
                        disabled={catalogSaving}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost small"
                      onClick={() => handleAddAlbum(album.name)}
                      disabled={catalogSaving}
                    >
                      Add to catalog
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <h3>Versions in selected group</h3>
            {selectedVersions.length === 0 ? <p className="muted">No versions yet.</p> : null}
            <ul className="member-list">
              {selectedVersions.map((version) => (
                <li key={version.key}>
                  <span>{version.name}</span>
                  <button
                    type="button"
                    className="btn btn-ghost small"
                    onClick={() => handleRemoveVersion(version.key)}
                    disabled={catalogSaving}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>

            {editingAlbumKey ? (
              <div className="form-grid compact">
                <label>
                  Rename album
                  <input
                    value={editingAlbumName}
                    onChange={(e) => setEditingAlbumName(e.target.value)}
                    placeholder="Album name"
                  />
                </label>
                <div className="center-action">
                  <button
                    type="button"
                    className="btn btn-primary small"
                    onClick={handleRenameAlbum}
                    disabled={catalogSaving || !editingAlbumName.trim()}
                  >
                    Save album name
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost small"
                    onClick={() => {
                      setEditingAlbumKey("");
                      setEditingAlbumName("");
                    }}
                    disabled={catalogSaving}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        <ul className="member-list">
          {sortedGroupEntries.map(([key, value]) => {
            const members = Object.values(value?.members || {}).filter(Boolean);
            const cardCount = groupCardCounts[key] || 0;
            return (
              <li key={key}>
                <span>{value?.name || key}</span>
                <strong>
                  {members.length} members
                  {value?.membersLocked ? " (locked)" : ""}
                  {" • "}
                  {cardCount} cards
                </strong>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="card-grid">
        {visibleItems.map((item) => {
          const isEditing = editingId === item.id;
          return (
            <article key={item.id} className="photo-card static admin-card">
              <StorageImage
                src={item.imageUrl || item.coverImage || ""}
                thumbPath={item.thumbPath}
                alt={item.title || "Photocard"}
              />

              <div>
                {!isEditing ? (
                  <>
                    <p className="photo-title">{item.title || "Untitled"}</p>
                    <p className="photo-meta">
                      {item.group || "Unknown group"} - {item.member || "Unknown"}
                    </p>
                    <p className="photo-meta">
                      {item.album || item.sourceName || "Unknown source"}
                      {item.rarity ? ` • ${formatRarityLabel(item.rarity)}` : ""}
                    </p>
                  </>
                ) : (
                  <div className="admin-form-grid">
                    <label>
                      Title
                      <input
                        value={form.title}
                        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      />
                    </label>
                    <label>
                      Group
                      <input
                        value={form.group}
                        onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))}
                      />
                    </label>
                    <label>
                      Member
                      <input
                        value={form.member}
                        onChange={(e) => setForm((f) => ({ ...f, member: e.target.value }))}
                      />
                    </label>
                    <label>
                      Album
                      <input
                        value={form.album}
                        onChange={(e) => setForm((f) => ({ ...f, album: e.target.value }))}
                      />
                    </label>
                    <label>
                      Type
                      <input
                        value={form.rarity}
                        onChange={(e) => setForm((f) => ({ ...f, rarity: e.target.value }))}
                      />
                    </label>
                    <label>
                      Version
                      <input
                        value={form.version}
                        onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
                      />
                    </label>
                    <label>
                      Source
                      <input
                        value={form.sourceName}
                        onChange={(e) => setForm((f) => ({ ...f, sourceName: e.target.value }))}
                      />
                    </label>
                    <label>
                      POB store
                      <input
                        value={form.pobStore}
                        onChange={(e) => setForm((f) => ({ ...f, pobStore: e.target.value }))}
                      />
                    </label>
                    <label>
                      Other type
                      <input
                        value={form.otherType}
                        onChange={(e) => setForm((f) => ({ ...f, otherType: e.target.value }))}
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="card-actions admin-actions">
                {!isEditing ? (
                  <button
                    className="btn btn-ghost small"
                    type="button"
                    onClick={() => startEdit(item)}
                  >
                    Edit
                  </button>
                ) : (
                  <>
                    <button
                      className="btn btn-primary small"
                      type="button"
                      onClick={() => handleSave(item.id)}
                      disabled={saving}
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button
                      className="btn btn-ghost small"
                      type="button"
                      onClick={() => setEditingId("")}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                  </>
                )}

                <button
                  className="btn btn-ghost small danger-btn"
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  disabled={removingId === item.id}
                >
                  {removingId === item.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {visibleItems.length < filtered.length ? (
        <div className="center-action">
          <button
            type="button"
            className="btn btn-ghost small"
            onClick={() => setVisibleCount((prev) => prev + 40)}
          >
            Load more
          </button>
        </div>
      ) : null}

      <Nav />
    </main>
  );
}
