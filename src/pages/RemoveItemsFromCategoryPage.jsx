import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { auth, db } from "../../firebase-config";
import { ref, child, get, update } from "firebase/database";
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
          categoryIds: val.categoryIds || null,
          categoryNames: val.categoryNames || null,
          ...val,
        });
      }
    }
  } catch (e) {
    console.warn("loadItemsForCollection nested error", e);
  }

  if (list.length === 0) {
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
            categoryIds: val.categoryIds || null,
            categoryNames: val.categoryNames || null,
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

export default function RemoveItemsFromCategoryPage() {
  const { uid, collectionId, categoryId } = useParams();
  const navigate = useNavigate();

  const [cat, setCat] = useState(null);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [inCatSet, setInCatSet] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [processing, setProcessing] = useState(false);

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

        let allowedType = normType(catData?.type || colData?.type);
        const hasAllowed = !!allowedType;
        if (!hasAllowed) allowedType = "";

        const listRaw = await loadItemsForCollection({
          userRoot,
          collectionId,
          colType: normType(colData?.type),
        });

        const inCat = listRaw.filter((it) => isInCat(it, catData));
        const filtered = hasAllowed
          ? inCat.filter((it) => normType(it.type) === allowedType)
          : inCat;

        const inSet = new Set(filtered.map((it) => it.id));

        if (!alive) return;
        setCat(catData);
        setItems(filtered);
        setSelected(new Set());
        setInCatSet(inSet);
        setLoading(false);
      } catch (e) {
        console.error(e);
        if (!alive) return;
        setErr("Could not load category items.");
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
    return [...selected].filter((id) => inCatSet.has(id));
  }, [selected, inCatSet]);
  const selectedCount = chosen.length;

  async function onSubmit() {
    if (selectedCount === 0) return;

    try {
      setProcessing(true);
      const me = auth.currentUser;
      const myUid = uid || me?.uid;
      if (!myUid) throw new Error("Not logged in.");

      const updates = {};

      for (const itemId of chosen) {
        updates[
          `users/${myUid}/collections/${collectionId}/categories/${cat.id}/items/${itemId}`
        ] = null;

        updates[
          `users/${myUid}/collectionItems/${itemId}/categoryIds/${cat.id}`
        ] = null;
        updates[
          `users/${myUid}/collectionItems/${itemId}/categoryNames/${cat.id}`
        ] = null;

        updates[`users/${myUid}/collectionItems/${itemId}/categoryId`] = null;
        updates[`users/${myUid}/collectionItems/${itemId}/category`] = null;
      }

      if (Object.keys(updates).length > 0) {
        await update(ref(db), updates);
      }

      navigate(
        `/users/${myUid}/collections/${collectionId}/categories/${cat.id}`
      );
    } catch (e) {
      console.error("Remove items failed:", e);
      setErr(e?.message || "Kunne ikke fjerne items.");
      setProcessing(false);
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
            disabled={processing}
          >
            <img src={backArrow} alt="Back" className="back-arrow" />
          </button>

          <h1 className="page-title">
            Remove items from “{cat?.title || "category"}”
          </h1>
        </div>
      </div>

      <div className="search-container">
        <input
          type="search"
          onChange={onSearchChange}
          placeholder={`Search in ${cat?.title || "category"}`}
          className="search-input"
          aria-label="Search items"
        />
        {searching && <span>Searching…</span>}
      </div>

      {visibleItems.length === 0 ? (
        <p className="aftersignup-subtitle">
          Ingen items fundet i denne kategori.
        </p>
      ) : (
        <div
          className="hscroll-strip author-page-items"
          style={{ marginTop: 10 }}
        >
          {visibleItems.map((it) => {
            const isSel = selected.has(it.id);
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => toggle(it.id)}
                className={`collection-card selectable ${
                  isSel ? "is-selected" : ""
                }`}
                aria-pressed={isSel}
                aria-label={`Vælg ${it.title}`}
                title={it.title}
                disabled={processing}
              >
                <div className={`cover-frame ${isSel ? "selected" : ""}`}>
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

      <div style={{ marginTop: 16 }}>
        {err && <p className="error-text">{err}</p>}
        <button
          className="get-started-btn create-collection-btn"
          onClick={onSubmit}
          disabled={selectedCount === 0 || processing}
          aria-disabled={selectedCount === 0 || processing}
        >
          {processing ? "Removing..." : `Remove items (${selectedCount})`}
        </button>
      </div>

      <Nav />
    </main>
  );
}
