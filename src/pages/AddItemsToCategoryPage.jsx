import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { auth, db } from "../../firebase-config";
import { ref, child, get, update } from "firebase/database";
import Nav from "../components/Nav";
import backArrow from "../assets/icons/backarrow.svg";

/* ---------- helpers ---------- */
function normType(t) {
  const x = (t || "").toLowerCase();
  if (x === "books") return "book";
  if (x === "albums") return "album";
  if (x === "vinyl") return "vinyl";
  if (x === "book") return "book";
  if (x === "album") return "album";
  return x;
}

function pickImage(val = {}) {
  const read = (x) => {
    if (!x) return "";
    if (typeof x === "string") return x;
    if (Array.isArray(x)) {
      for (const y of x) {
        const s = read(y);
        if (s) return s;
      }
      return "";
    }
    if (typeof x === "object") {
      return (
        read(x.url) ||
        read(x.src) ||
        read(x.href) ||
        read(x.thumbnail) ||
        read(x.medium) ||
        read(x.small) ||
        read(x.large) ||
        ""
      );
    }
    return "";
  };

  const candidates = [
    val?.images?.cover,
    val?.coverImage,
    val?.imageUrl,
    val?.image,
    val?.thumbnail,
    val?.volumeInfo?.imageLinks?.thumbnail,
    val?.volumeInfo?.imageLinks?.smallThumbnail,
    val?.images,
  ];

  for (const c of candidates) {
    const u = read(c);
    if (typeof u === "string" && u.trim()) {
      return u.trim().replace(/^["']|["']$/g, "");
    }
  }
  return "";
}

async function loadCollection({ userRoot, collectionId }) {
  const snap = await get(
    child(ref(db), `${userRoot}/collections/${collectionId}`)
  );
  if (!snap.exists()) return null;
  return snap.val() || null;
}

async function loadCategory({ userRoot, collectionId, categoryId }) {
  const path = `${userRoot}/collections/${collectionId}/categories/${categoryId}`;
  const snap = await get(child(ref(db), path));
  if (!snap.exists()) return null;
  const val = snap.val() || {};
  return {
    id: val.id || categoryId,
    title: val.title || "Untitled",
    type: normType(val.type || ""),
    coverImage: val.coverImage || "",
    createdAt: Number(val.createdAt || 0),
    ...val,
  };
}

async function loadItemsForCollection({ userRoot, collectionId, colType }) {
  const nestedPath = `${userRoot}/collectionItems/${collectionId}`;
  const flatPath = `${userRoot}/collectionItems`;
  let list = [];

  try {
    // NESTED: items hører allerede til collectionId
    const snap = await get(child(ref(db), nestedPath));
    if (snap.exists()) {
      const obj = snap.val() || {};
      for (const [key, val] of Object.entries(obj)) {
        if (key === "_placeholder") continue;
        list.push({
          id: key,
          title: val.title || val.name || "Untitled",
          author: val.author || val.artist || "",
          coverImage: pickImage(val),
          type: normType(val.type || colType),
          collectionId,
          createdAt: Number(val.createdAt || 0),
          categoryId: val.categoryId || val.categoryID || "",
          category: val.category || val.categoryName || "",
          ...val,
        });
      }
    }
  } catch (e) {
    console.warn("loadItemsForCollection nested error", e);
  }

  if (list.length === 0) {
    // FLAT: filtrér kun dem der hører til denne collection
    try {
      const snap = await get(child(ref(db), flatPath));
      if (snap.exists()) {
        const obj = snap.val() || {};
        for (const [key, val] of Object.entries(obj)) {
          if (key === "_placeholder") continue;
          list.push({
            id: key,
            title: val.title || val.name || "Untitled",
            author: val.author || val.artist || "",
            coverImage: pickImage(val),
            type: normType(val.type || colType),
            createdAt: Number(val.createdAt || 0),
            categoryId: val.categoryId || val.categoryID || "",
            category: val.category || val.categoryName || "",
            ...val,
          });
        }
      }
    } catch (e) {
      console.warn("loadItemsForCollection flat error", e);
    }
  }

  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return list;
}

function capitalizeWords(str = "") {
  return str
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function isInCat(it, cat) {
  const idStr = String(cat.id);
  const titleStr = String(cat.title || "").toLowerCase();

  if (String(it.categoryId || it.categoryID || "") === idStr) return true;
  if (String(it.category || it.categoryName || "").toLowerCase() === titleStr)
    return true;

  if (Array.isArray(it.categoryIds) && it.categoryIds.includes(idStr))
    return true;
  if (Array.isArray(it.categories)) {
    if (
      it.categories
        .map((c) => (c?.title || c)?.toString().toLowerCase())
        .includes(titleStr)
    )
      return true;
  }

  if (
    it.categoryIds &&
    typeof it.categoryIds === "object" &&
    it.categoryIds[idStr]
  )
    return true;
  if (it.categoryNames && typeof it.categoryNames === "object") {
    const foundByTitle = Object.values(it.categoryNames)
      .map((v) => String(v || "").toLowerCase())
      .includes(titleStr);
    if (foundByTitle) return true;
  }

  return false;
}

/* ---------- component ---------- */
export default function AddItemsToCategoryPage() {
  const { uid, collectionId, categoryId } = useParams();
  const navigate = useNavigate();

  const [cat, setCat] = useState(null);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [alreadyInCat, setAlreadyInCat] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setErr("");
      setLoading(true);
      try {
        const me = auth.currentUser;
        const myUid = uid || me?.uid;
        if (!myUid) {
          setErr("You must be logged in.");
          setLoading(false);
          return;
        }
        const userRoot = `users/${myUid}`;

        const colData = await loadCollection({ userRoot, collectionId });
        if (!colData) {
          setErr("Collection not found.");
          setLoading(false);
          return;
        }
        const catData = await loadCategory({
          userRoot,
          collectionId,
          categoryId,
        });
        if (!catData) {
          setErr("Category not found.");
          setLoading(false);
          return;
        }

        // Tilladt type (kategori har forrang – ellers collection)
        let allowedType = normType(catData?.type || colData?.type);
        // Hvis hverken kategori eller collection har en brugbar type, så vis alt
        const hasAllowed = !!allowedType;
        if (!hasAllowed) {
          // sidste nød-fallback: hvis vi ikke kan udlede type, viser vi alle items
          allowedType = "";
        }

        const listRaw = await loadItemsForCollection({
          userRoot,
          collectionId,
          colType: normType(colData?.type),
        });

        const list = hasAllowed
          ? listRaw.filter((it) => normType(it.type) === allowedType)
          : listRaw;

        const pre = new Set(
          list.filter((it) => isInCat(it, catData)).map((it) => it.id)
        );

        if (!alive) return;
        setCat(catData);
        setItems(list);
        setSelected(new Set());
        setAlreadyInCat(new Set(pre));
        setLoading(false);
      } catch (e) {
        console.error(e);
        if (!alive) return;
        setErr("Could not load items.");
        setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [uid, collectionId, categoryId]);

  const visibleItems = useMemo(() => {
    const term = (q || "").trim().toLowerCase();
    if (!term) return items;
    return items.filter((it) =>
      `${it.title || ""} ${it.author || ""}`.toLowerCase().includes(term)
    );
  }, [items, q]);

  function onSearchChange(e) {
    const val = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      setQ(val);
      setSearching(false);
    }, 250);
  }

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const chosen = useMemo(() => {
    return [...selected].filter((id) => !alreadyInCat.has(id));
  }, [selected, alreadyInCat]);
  const selectedCount = chosen.length;

  async function onSubmit() {
    try {
      const me = auth.currentUser;
      const myUid = uid || me?.uid;
      if (!myUid) return;

      const updates = {};
      chosen.forEach((itemId) => {
        updates[
          `users/${myUid}/collectionItems/${itemId}/categoryIds/${cat.id}`
        ] = true;
        updates[
          `users/${myUid}/collectionItems/${itemId}/categoryNames/${cat.id}`
        ] = cat.title;

        // Reverse index under kategorien
        updates[
          `users/${myUid}/collections/${collectionId}/categories/${cat.id}/items/${itemId}`
        ] = true;

        // ryd evt. tom nested-node
        updates[`users/${myUid}/collectionItems/${collectionId}/${itemId}`] =
          null;
      });

      if (Object.keys(updates).length) {
        await update(ref(db), updates);
      }
      navigate(
        `/users/${myUid}/collections/${collectionId}/categories/${cat.id}`
      );
    } catch (e) {
      console.error(e);
      setErr("Could not add items to category.");
    }
  }

  if (loading) {
    return (
      <main className="landing-container">
        <h1 className="page-title">Loading…</h1>
      </main>
    );
  }
  if (err) {
    return (
      <main className="landing-container">
        <h1 className="page-title">{err}</h1>
      </main>
    );
  }

  return (
    <main className="add-to-cat" style={{ paddingBottom: 140 }}>
      <div>
        <div className="landing-text">
          <button
            onClick={() => navigate(-1)}
            className="back-arrow-link"
            aria-label="Go back"
          >
            <img src={backArrow} alt="Back" className="back-arrow" />
          </button>

          <h1 className="page-title">
            Add items to “{capitalizeWords(cat?.title || "category")}”
          </h1>
        </div>
      </div>

      <div className="search-container">
        <input
          type="search"
          onChange={onSearchChange}
          placeholder="Search your collection"
          className="search-input"
          aria-label="Search items"
        />
        {searching && <span>Searching…</span>}
      </div>

      {visibleItems.length === 0 ? (
        <p className="aftersignup-subtitle">No items found.</p>
      ) : (
        <div
          className="hscroll-strip author-page-items"
          style={{ marginTop: 10 }}
        >
          {visibleItems.map((it) => {
            const isSel = selected.has(it.id);
            const isDisabled = alreadyInCat.has(it.id);

            return (
              <button
                key={it.id}
                type="button"
                onClick={() => !isDisabled && toggle(it.id)}
                disabled={isDisabled}
                className={`collection-card selectable ${
                  isSel && !isDisabled ? "is-selected" : ""
                } ${isDisabled ? "is-disabled" : ""}`}
                aria-pressed={isSel}
                aria-label={`Select ${it.title}`}
                title={it.title}
              >
                <div
                  className={`cover-frame ${
                    isSel && !isDisabled ? "selected" : ""
                  }`}
                >
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
              </button>
            );
          })}
        </div>
      )}

      <div>
        <button
          className="get-started-btn create-collection-btn"
          onClick={onSubmit}
          disabled={selectedCount === 0}
          aria-disabled={selectedCount === 0}
        >
          Add items to category {selectedCount > 0 ? `(${selectedCount})` : ""}
        </button>
      </div>

      <Nav />
    </main>
  );
}
