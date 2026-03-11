import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ref, get, remove } from "firebase/database";
import { auth, db } from "../../firebase-config";
import { formatRarityLabel } from "../lib/rarity";
import Nav from "../components/Nav";
import StorageImage from "../components/StorageImage";

function norm(value) {
  return String(value || "").trim().toLowerCase();
}

export default function CollectionPage() {
  const { collectionId } = useParams();
  const [collection, setCollection] = useState(null);
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [memberFilter, setMemberFilter] = useState("");
  const [albumFilter, setAlbumFilter] = useState("");
  const [rarityFilter, setRarityFilter] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [removingId, setRemovingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
        const colSnap = await get(ref(db, `users/${uid}/collections/${collectionId}`));
        if (!colSnap.exists()) {
          setError("Collection not found.");
          setLoading(false);
          return;
        }

        const itemSnap = await get(ref(db, `users/${uid}/collectionItems`));
        const raw = itemSnap.exists() ? itemSnap.val() : {};
        const nextItems = Object.keys(raw || {})
          .filter((k) => !k.startsWith("_"))
          .map((k) => ({ id: k, ...raw[k] }))
          .filter((item) => item.collectionId === collectionId)
          .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

        if (!alive) return;
        setCollection(colSnap.val() || {});
        setItems(nextItems);
        setLoading(false);
      } catch (err) {
        if (!alive) return;
        setError(err?.message || "Could not load collection.");
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [collectionId]);

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
  }, [items, query, memberFilter, albumFilter, rarityFilter, sortBy]);

  async function handleRemove(itemId) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    if (!window.confirm("Remove this photocard from this collection?")) return;

    setRemovingId(itemId);
    try {
      await remove(ref(db, `users/${uid}/collectionItems/${itemId}`));
      setItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (err) {
      setError(err?.message || "Could not remove photocard.");
    } finally {
      setRemovingId("");
    }
  }

  if (loading) {
    return (
      <main className="page-content with-nav-space">
        <p className="muted">Loading collection...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page-content with-nav-space">
        <p className="error-text">{error}</p>
        <Nav />
      </main>
    );
  }

  const uid = auth.currentUser?.uid;

  return (
    <main className="page-content with-nav-space">
      <section className="section-heading-row">
        <div>
          <h1>{collection?.title || "Collection"}</h1>
          <p className="muted">{collection?.description || "Photocard binder"}</p>
        </div>
        <div className="section-actions">
          <Link
            to={`/users/${uid}/collections/${collectionId}/edit`}
            className="btn btn-ghost small"
          >
            Edit collection
          </Link>
          <Link
            to={`/users/${uid}/collections/${collectionId}/add-existing`}
            className="btn btn-primary small"
          >
            Add
          </Link>
        </div>
      </section>

      <section className="section-block">
        <label className="search-label">
          Search cards
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="member, group, title"
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

      {filteredAndSorted.length === 0 && (
        <div className="empty-state">
          <h2>No photocards yet</h2>
          <p>Upload one to this collection.</p>
        </div>
      )}

      <div className="card-grid">
        {filteredAndSorted.map((item) => (
          <article key={item.id} className="photo-card static">
            <Link
              to={`/users/${uid}/collections/${collectionId}/items/${item.id}`}
              className="photo-card-link"
            >
              <StorageImage
                src={item.imageUrl || item.coverImage || ""}
                thumbPath={item.thumbPath}
                alt={item.title || "Photocard"}
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

      <Nav />
    </main>
  );
}
