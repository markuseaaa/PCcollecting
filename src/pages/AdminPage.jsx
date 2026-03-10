import { useEffect, useMemo, useState } from "react";
import { ref, get, update } from "firebase/database";
import { serverTimestamp } from "firebase/database";
import { auth, db } from "../../firebase-config";
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

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [items, setItems] = useState([]);
  const [groupCatalog, setGroupCatalog] = useState({});
  const [query, setQuery] = useState("");
  const [groupInput, setGroupInput] = useState("");
  const [memberInput, setMemberInput] = useState("");
  const [selectedGroupKey, setSelectedGroupKey] = useState("");
  const [catalogSaving, setCatalogSaving] = useState(false);

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

  const sortedGroupEntries = useMemo(() => {
    return Object.entries(groupCatalog || {}).sort((a, b) =>
      String(a[1]?.name || a[0]).localeCompare(String(b[1]?.name || b[0]))
    );
  }, [groupCatalog]);

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

  async function buildPropagationUpdates(itemId, patch, mode) {
    const usersSnap = await get(ref(db, "users"));
    const updates = {};

    usersSnap.forEach((userCh) => {
      const uid = userCh.key;
      const collItemsCh = userCh.child("collectionItems");
      if (!collItemsCh.exists()) return;

      collItemsCh.forEach((itemCh) => {
        const val = itemCh.val() || {};
        const isMatch = val.sourceItemId === itemId || itemCh.key === itemId;
        if (!isMatch) return;

        const userItemPath = `users/${uid}/collectionItems/${itemCh.key}`;
        if (mode === "delete") {
          updates[userItemPath] = null;
        } else {
          for (const field of EDIT_FIELDS) {
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
      const updates = {
        [`items/${itemId}`]: null,
      };

      const propagated = await buildPropagationUpdates(itemId, {}, "delete");
      Object.assign(updates, propagated);

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
    const key = normalize(name);
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
        [key]: { name, members: {}, updatedAt: Date.now() },
      }));
      setSelectedGroupKey(key);
      setGroupInput("");
    } catch (err) {
      setError(err?.message || "Could not add group.");
    } finally {
      setCatalogSaving(false);
    }
  }

  async function handleAddMember() {
    setError("");
    const groupKey = selectedGroupKey || normalize(groupInput);
    const memberName = memberInput.trim();
    const memberKey = normalize(memberName);
    if (!groupKey || !memberName) return;

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
        <h2>Group & member list</h2>
        <p className="muted">Manage the options shown when users add new photocards.</p>

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
              onChange={(e) => setSelectedGroupKey(e.target.value)}
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
        </div>

        <div className="center-action">
          <button
            type="button"
            className="btn btn-primary small"
            onClick={handleAddMember}
            disabled={catalogSaving || !(selectedGroupKey || groupInput.trim()) || !memberInput.trim()}
          >
            Add member
          </button>
        </div>

        <ul className="member-list">
          {sortedGroupEntries.map(([key, value]) => {
            const members = Object.values(value?.members || {}).filter(Boolean);
            return (
              <li key={key}>
                <span>{value?.name || key}</span>
                <strong>{members.length} members</strong>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="card-grid">
        {filtered.map((item) => {
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

      <Nav />
    </main>
  );
}
