import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router";
import { db, auth } from "../../firebase-config";
import {
  ref as dbRef,
  get,
  push,
  update,
  serverTimestamp,
} from "firebase/database";
import scan from "../assets/icons/scan.svg";
import Nav from "../components/Nav";

export default function AddItem() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const [addedItems, setAddedItems] = useState(new Set());
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [filterType, setFilterType] = useState("all");
  const debounceRef = useRef(null);

  const normalize = (s) =>
    String(s || "")
      .trim()
      .toLowerCase();

  const fetchAllAndFilter = useCallback(async (term, typeFilter = "all") => {
    const snap = await get(dbRef(db, "items"));
    const items = [];

    if (!snap.exists()) return [];

    snap.forEach((ch) => {
      const val = ch.val();
      if (!val) return;
      items.push({
        id: ch.key,
        title: val.title || "",
        author: val.author || "",
        type: val.type || "unknown",
        coverImage: val.images?.cover || null,
        description: val.description || "",
      });
    });

    const low = normalize(term);

    return items.filter((i) => {
      const matchesSearch = (i.title + " " + i.author)
        .toLowerCase()
        .includes(low);
      const matchesType =
        typeFilter === "all" || i.type.toLowerCase() === typeFilter;
      return matchesSearch && matchesType;
    });
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q || q.trim() === "") {
      setResults([]);
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");

    debounceRef.current = setTimeout(async () => {
      try {
        const items = await fetchAllAndFilter(q, filterType);
        setResults(items);
      } catch (err) {
        console.error("Search error:", err);
        setError("Couldn't fetch search results.");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [q, filterType, fetchAllAndFilter]);

  // Tilføj item til brugerens collection
  async function handleAdd(item) {
    setError("");
    setSuccessMsg("");
    setAddingId(item.id);
    try {
      const user = auth.currentUser;
      if (!user || !user.uid) throw new Error("You need to be logged in.");
      const uid = user.uid;

      // Tjek dubletter
      const userItemsSnap = await get(
        dbRef(db, `users/${uid}/collectionItems`)
      );
      if (userItemsSnap.exists()) {
        let already = false;
        userItemsSnap.forEach((ch) => {
          const val = ch.val();
          if (val?.sourceItemId === item.id || val?.itemId === item.id) {
            already = true;
            return true;
          }
        });
        if (already) {
          setSuccessMsg("This item is already added.");
          setAddedItems((prev) => new Set(prev).add(item.id));
          setAddingId(null);
          return;
        }
      }

      // Opret ny nøgle
      const newRef = push(dbRef(db, `users/${uid}/collectionItems`));
      const newId = newRef.key;

      const payload = {
        id: newId,
        sourceItemId: item.id,
        title: item.title || "",
        author: item.author || "",
        coverImage: item.coverImage || null,
        type: item.type || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const updates = {};
      updates[`users/${uid}/collectionItems/${newId}`] = payload;
      updates[`users/${uid}/collectionItems/_placeholder`] = true;

      await update(dbRef(db), updates);
      setAddedItems((prev) => new Set(prev).add(item.id));
      setSuccessMsg("Item added!");
    } catch (err) {
      console.error("Add item error:", err);
      setError(err?.message || "Couldn't add item.");
    } finally {
      setAddingId(null);
    }
  }

  return (
    <main className="add-item-page">
      <h1 className="page-title">Add an item</h1>

      <div className="landing-page-btns">
        <Link to="/scan" className="login-btn scan-btn" aria-label="scan">
          Scan
          <img src={scan} alt="scan icon" aria-hidden="true" />
        </Link>
      </div>

      <section>
        <div className="search-container">
          <div className="filter-buttons">
            {["all", "book", "album", "vinyl"].map((type) => (
              <button
                key={type}
                className={`filter-btn ${filterType === type ? "active" : ""}`}
                onClick={() => setFilterType(type)}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="search-input"
          />
        </div>

        {loading && <p className="loading-text">Searching…</p>}
        {error && <p className="error-text">{error}</p>}
        {successMsg && <p className="success-text">{successMsg}</p>}

        <ul className="item-list">
          {!loading && results.length === 0 && q && <li>No results</li>}

          {results.map((item) => {
            const isAdded = addedItems.has(item.id);
            return (
              <li key={item.id} className="item">
                <img
                  src={item.coverImage || "/placeholder.png"}
                  alt={item.title}
                  className="item-cover"
                />
                <div className="item-info">
                  <div className="item-title">{item.title}</div>
                  <div className="item-author">{item.author}</div>
                </div>
                <button
                  onClick={() => handleAdd(item)}
                  disabled={addingId === item.id || isAdded}
                  className={`add-btn ${isAdded ? "added" : ""}`}
                >
                  {addingId === item.id ? "Adding…" : isAdded ? "Added" : "Add"}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <Link
        to="/submit"
        className="get-started-btn submit-btn"
        aria-label="No result? Submit here"
      >
        No result? Submit here
      </Link>
      <Nav />
    </main>
  );
}
