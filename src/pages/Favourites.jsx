import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { auth, db } from "../../firebase-config";
import { ref as dbRef, get, onValue, off } from "firebase/database";
import Nav from "../components/Nav";
import backArrow from "../assets/icons/backarrow.svg";

function normType(t) {
  const x = (t || "").toLowerCase();
  if (x === "books") return "book";
  if (x === "albums") return "album";
  if (x === "vinyl") return "vinyl";
  if (x === "book") return "book";
  if (x === "album") return "album";
  return x;
}
function labelForType(t) {
  const n = normType(t);
  if (n === "book") return "Books";
  if (n === "album") return "Albums";
  if (n === "vinyl") return "Vinyl";
  return (t || "").charAt(0).toUpperCase() + (t || "").slice(1);
}
function pickImage(val) {
  if (!val || typeof val !== "object") return "";
  const candidates = [
    val?.images?.cover,
    val?.coverImage,
    val?.imageUrl,
    val?.image,
    val?.thumbnail,
    val?.volumeInfo?.imageLinks?.thumbnail,
    val?.volumeInfo?.imageLinks?.smallThumbnail,
  ];
  const u = (
    candidates.find((x) => typeof x === "string" && x.trim()) || ""
  ).trim();
  return u.replace(/^["']|["']$/g, "");
}
const normName = (s) => (s || "").trim().toLowerCase();

export default function Favourites() {
  const navigate = useNavigate();

  const [items, setItems] = useState([]);

  const [favAuthorNames, setFavAuthorNames] = useState([]);

  const [favBookAuthors, setFavBookAuthors] = useState([]);
  const [favArtists, setFavArtists] = useState([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  const [authorFilter, setAuthorFilter] = useState(null);

  useEffect(() => {
    let alive = true;
    setErr("");
    setLoading(true);

    const uid = auth.currentUser?.uid;
    if (!uid) {
      setErr("You must be logged in.");
      setLoading(false);
      return;
    }

    const favItemsRef = dbRef(db, `users/${uid}/favourites/items`);

    const listener = async (snap) => {
      if (!alive) return;

      if (!snap.exists()) {
        setItems([]);
        setLoading(false);
        return;
      }

      const ids = [];
      const createdAtById = {};
      snap.forEach((ch) => {
        ids.push(ch.key);
        const v = ch.val();
        if (v && typeof v === "object" && v.createdAt) {
          createdAtById[ch.key] = Number(v.createdAt) || 0;
        }
      });

      const results = await Promise.all(
        ids.map(async (itemId) => {
          try {
            const userSnap = await get(
              dbRef(db, `users/${uid}/collectionItems/${itemId}`)
            );
            if (userSnap.exists()) {
              const v = userSnap.val() || {};
              return {
                id: itemId,
                title: v.title || v.name || "Untitled",
                author: v.author || v.artist || "",
                coverImage: pickImage(v),
                type: normType(v.type),
                createdAt:
                  createdAtById[itemId] ||
                  Number(v.createdAt || v.addedAt || 0) ||
                  0,
              };
            }
            const globalSnap = await get(dbRef(db, `items/${itemId}`));
            if (globalSnap.exists()) {
              const v = globalSnap.val() || {};
              return {
                id: itemId,
                title: v.title || v.name || "Untitled",
                author: v.author || v.artist || "",
                coverImage: pickImage(v),
                type: normType(v.type),
                createdAt:
                  createdAtById[itemId] ||
                  Number(v.createdAt || v.addedAt || 0) ||
                  0,
              };
            }
          } catch (e) {
            console.warn("hydrate favourite item error", itemId, e);
          }
          return {
            id: itemId,
            title: "Untitled",
            author: "",
            coverImage: "",
            type: "",
            createdAt: createdAtById[itemId] || 0,
          };
        })
      );

      results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setItems(results);
      setLoading(false);
    };

    onValue(favItemsRef, listener);
    return () => {
      alive = false;
      off(favItemsRef, "value", listener);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const authorsRef = dbRef(db, `users/${uid}/favourites/authors`);

    const listener = (snap) => {
      if (!snap.exists()) {
        setFavAuthorNames([]);
        return;
      }
      const names = new Set();
      snap.forEach((ch) => {
        const val = ch.val();
        if (val === true) {
          names.add(decodeURIComponent(ch.key || ""));
        } else if (typeof val === "string") {
          names.add(val);
        } else if (val && typeof val === "object") {
          const n =
            val.name ||
            val.title ||
            val.author ||
            val.displayName ||
            val.slug ||
            "";
          if (n && typeof n === "string") names.add(n);
        }
      });
      setFavAuthorNames(
        Array.from(names).sort((a, b) =>
          a.toLowerCase().localeCompare(b.toLowerCase())
        )
      );
    };

    onValue(authorsRef, listener);
    return () => off(authorsRef, "value", listener);
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || favAuthorNames.length === 0) {
      setFavBookAuthors([]);
      setFavArtists([]);
      return;
    }

    let alive = true;

    (async () => {
      try {
        const userItemsSnap = await get(
          dbRef(db, `users/${uid}/collectionItems`)
        );

        const typeMap = new Map();

        const addTypeFor = (name, t) => {
          const key = normName(name);
          const tt = normType(t);
          if (!key || !tt) return;
          if (!typeMap.has(key)) typeMap.set(key, new Set());
          typeMap.get(key).add(tt);
        };

        if (userItemsSnap.exists()) {
          userItemsSnap.forEach((ch) => {
            const v = ch.val();
            const name = v?.author || v?.artist || "";
            const t = v?.type || "";
            if (name && t) addTypeFor(name, t);
          });
        }

        for (const it of items) {
          if (it?.author && it?.type) addTypeFor(it.author, it.type);
        }

        const books = [];
        const artists = [];
        for (const displayName of favAuthorNames) {
          const key = normName(displayName);
          const seen = typeMap.get(key) || new Set();

          const isBook = seen.has("book");
          const isArtist = seen.has("album") || seen.has("vinyl");

          if (isBook) books.push(displayName);
          if (isArtist) artists.push(displayName);
        }

        if (!alive) return;

        const ciSort = (a, b) => a.toLowerCase().localeCompare(b.toLowerCase());
        setFavBookAuthors(books.sort(ciSort));
        setFavArtists(artists.sort(ciSort));
      } catch (e) {
        console.warn("author type derive failed", e);
        setFavBookAuthors([]);
        setFavArtists([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [favAuthorNames, items]);

  const onSearchChange = (e) => {
    const val = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      setQ(val);
      setSearching(false);
    }, 250);
  };

  const filteredBySearch = useMemo(() => {
    const term = (q || "").trim().toLowerCase();
    if (!term) return items;
    return items.filter((it) =>
      `${it.title || ""} ${it.author || ""}`.toLowerCase().includes(term)
    );
  }, [items, q]);

  const filtered = useMemo(() => {
    if (!authorFilter) return filteredBySearch;
    const af = authorFilter.toLowerCase();
    return filteredBySearch.filter(
      (it) => (it.author || "").toLowerCase() === af
    );
  }, [filteredBySearch, authorFilter]);

  const itemsByType = useMemo(() => {
    const map = new Map();
    for (const it of filtered) {
      const t = normType(it.type || "") || "other";
      if (!map.has(t)) map.set(t, []);
      map.get(t).push(it);
    }
    return map;
  }, [filtered]);

  if (loading) {
    return (
      <main className="landing-container">
        <h1 className="page-title">Loading favourites…</h1>
      </main>
    );
  }
  if (err) {
    return (
      <main className="landing-container">
        <h1 className="page-title">{err}</h1>
        <Nav />
      </main>
    );
  }

  const searchActive = (q || "").trim().length > 0;
  const typeOrder = ["book", "album", "vinyl", "other"];
  const rows = [...itemsByType.entries()].sort(
    ([a], [b]) => typeOrder.indexOf(a) - typeOrder.indexOf(b)
  );

  return (
    <main style={{ paddingBottom: 130 }}>
      <div>
        <button
          onClick={() => navigate(-1)}
          className="back-arrow-link"
          aria-label="Go back"
        >
          <img src={backArrow} alt="Back" className="back-arrow" />
        </button>
        <h1 className="page-title">Favourites</h1>
      </div>

      <div className="search-container">
        <input
          type="search"
          onChange={onSearchChange}
          placeholder="Search your favourites"
          className="search-input"
          aria-label="Search favourites"
        />
        {searching && <span>Searching…</span>}
      </div>

      {(favBookAuthors.length > 0 || favArtists.length > 0) && (
        <section>
          {favBookAuthors.length > 0 && (
            <>
              <h3 className="aftersignup-subtitle-collection">
                My favourite authors
              </h3>
              <ul className="item-tags item-tags-wrap">
                {favBookAuthors.map((a) => (
                  <li
                    key={`book-${a}`}
                    className={`tag ${authorFilter === a ? "active" : ""}`}
                    title={a}
                  >
                    <Link
                      to={`/authors/${encodeURIComponent(a.toLowerCase())}`}
                      onClick={() => setAuthorFilter(null)}
                      aria-label={`Open author ${a}`}
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      {a}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          {favArtists.length > 0 && (
            <>
              <h3
                className="aftersignup-subtitle-collection"
                style={{ marginTop: 15 }}
              >
                My favourite artists
              </h3>
              <ul className="item-tags item-tags-wrap">
                {favArtists.map((a) => (
                  <li
                    key={`artist-${a}`}
                    className={`tag ${authorFilter === a ? "active" : ""}`}
                    title={a}
                  >
                    <Link
                      to={`/authors/${encodeURIComponent(a.toLowerCase())}`}
                      onClick={() => setAuthorFilter(null)}
                      className="author-link"
                      aria-label={`Open artist ${a}`}
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      {a}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {rows.length === 0 ? (
        <div>
          <h3 className="aftersignup-subtitle">No favourite items yet.</h3>
        </div>
      ) : (
        rows.map(([t, list]) => (
          <section key={t}>
            <h3 className="aftersignup-subtitle-collection">
              My favourite {labelForType(t).toLowerCase()}
            </h3>
            <div className="hscroll-strip no-scrollbar">
              {list.map((it) => (
                <Link
                  key={`${t}-${it.id}`}
                  to={`/items/${it.id}`}
                  className="collection-card"
                  aria-label={`Open ${it.title}`}
                  title={it.title}
                >
                  <div className="cover-frame">
                    <div className="cover-wrap">
                      {it.coverImage ? (
                        <img
                          src={it.coverImage}
                          alt={it.title}
                          className="cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="cover placeholder" />
                      )}
                    </div>
                  </div>
                  <h3 className="item-title">{it.title}</h3>
                  {it.author ? <p className="item-sub">{it.author}</p> : null}
                </Link>
              ))}
            </div>
            {searchActive && list.length === 0 && (
              <p style={{ opacity: 0.8, padding: "0 15px" }}>
                No matches found.
              </p>
            )}
          </section>
        ))
      )}

      <Nav />
    </main>
  );
}
