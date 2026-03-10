import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { auth, db } from "../../firebase-config";
import { ref, child, get } from "firebase/database";
import Nav from "../components/Nav";
import backArrow from "../assets/icons/backarrow.svg";
import settingsIcon from "../assets/icons/edit.svg";

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
    Array.isArray(val?.images) ? val.images[0] : "",
  ];

  const extract = (x) => {
    if (typeof x === "string") return x;
    if (x && typeof x === "object") {
      return x.url || x.src || x.href || x.thumbnail || "";
    }
    return "";
  };

  let u =
    candidates
      .map(extract)
      .find((s) => typeof s === "string" && s.trim().length > 0) || "";

  return u.trim().replace(/^["']|["']$/g, "");
}

function itemMatchesCategory(item, categoryId, categoryTitle) {
  const id = String(categoryId || "").trim();
  const title = String(categoryTitle || "")
    .trim()
    .toLowerCase();

  const catId = String(item?.categoryId || item?.categoryID || "").trim();
  const catKey = String(item?.categoryKey || "").trim();

  const cat = (item?.category || item?.Category || "").toString().toLowerCase();
  const catName = (item?.categoryName || "").toString().toLowerCase();

  const catIdsArr = Array.isArray(item?.categoryIds) ? item.categoryIds : [];
  const catsArr = Array.isArray(item?.categories)
    ? item.categories.map((c) => (c?.title || c)?.toString().toLowerCase())
    : [];

  const catIdsMap =
    item?.categoryIds &&
    typeof item.categoryIds === "object" &&
    !Array.isArray(item.categoryIds)
      ? item.categoryIds
      : null;
  const catNamesMap =
    item?.categoryNames && typeof item.categoryNames === "object"
      ? item.categoryNames
      : null;

  if (id && (catId === id || catKey === id || catIdsArr.includes(id)))
    return true;
  if (id && catIdsMap && catIdsMap[id]) return true;

  if (title) {
    if (cat === title || catName === title) return true;
    if (catsArr.includes(title)) return true;
    if (catNamesMap) {
      const hasTitle = Object.values(catNamesMap)
        .map((v) => String(v || "").toLowerCase())
        .includes(title);
      if (hasTitle) return true;
    }
  }

  return false;
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
    coverImage: pickImage(val),
    createdAt: Number(val.createdAt || 0),
    ...val,
  };
}

async function loadItemsForCollection({ userRoot, collectionId, colType }) {
  const nestedPath = `${userRoot}/collectionItems/${collectionId}`;
  const flatPath = `${userRoot}/collectionItems`;
  let list = [];
  let mode = "flat";

  const getCover = (val) => {
    const candidates = [
      val?.images?.cover,
      val?.coverImage,
      val?.imageUrl,
      val?.image,
      val?.thumbnail,
    ];
    let u = (
      candidates.find((x) => typeof x === "string" && x.trim()) || ""
    ).trim();
    return u.replace(/^["']|["']$/g, "");
  };

  try {
    const snap = await get(child(ref(db), nestedPath));
    if (snap.exists()) {
      const obj = snap.val() || {};
      for (const [key, val] of Object.entries(obj)) {
        if (!val || typeof val !== "object" || key === "_placeholder") continue;
        const title = String(val.title || val.name || "").trim();
        const cover = getCover(val);
        if (!title && !cover) continue;
        list.push({
          id: key,
          title: title || "Untitled",
          author: val.author || val.artist || "",
          coverImage: cover,
          type: normType(val.type || colType),
          collectionId,
          createdAt: Number(val.createdAt || 0),
          ...val,
        });
      }
      if (list.length > 0) mode = "nested";
    }
  } catch (err) {
    console.warn("loadItemsForCollection (nested) error:", err);
  }

  if (mode !== "nested") {
    list = [];
    try {
      const snap = await get(child(ref(db), flatPath));
      if (snap.exists()) {
        const obj = snap.val() || {};
        for (const [key, val] of Object.entries(obj)) {
          if (!val || typeof val !== "object" || key === "_placeholder")
            continue;
          const title = String(val.title || val.name || "").trim();
          const cover = getCover(val);
          if (!title && !cover) continue;
          list.push({
            id: key,
            title: title || "Untitled",
            author: val.author || val.artist || "",
            coverImage: cover,
            type: normType(val.type || colType),
            collectionId: val.collectionId,
            createdAt: Number(val.createdAt || 0),
            ...val,
          });
        }
        mode = "flat";
      }
    } catch (err) {
      console.warn("loadItemsForCollection (flat) error:", err);
    }
  }

  const tf = normType(colType);
  if (tf) list = list.filter((it) => it.type === tf);
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return list;
}

/* ---------- component ---------- */
export default function CategoryPage() {
  const { uid, collectionId, categoryId } = useParams();
  const [cat, setCat] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

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

        const colType = normType(colData?.type);
        const list = await loadItemsForCollection({
          userRoot,
          collectionId,
          colType,
        });

        const filtered = list.filter((it) =>
          itemMatchesCategory(it, catData.id, catData.title)
        );

        if (!alive) return;
        setCat(catData);
        setItems(filtered);
        setLoading(false);
      } catch (e) {
        console.error(e);
        if (!alive) return;
        setErr("Could not load category.");
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
    <main style={{ paddingBottom: 130 }}>
      <div>
        <button
          onClick={() => navigate(-1)}
          className="back-arrow-link"
          aria-label="Go back"
        >
          <img src={backArrow} alt="Back" className="back-arrow" />
        </button>
        <div className="title-row">
          <h1 className="page-title">{cat?.title || "Untitled category"}</h1>
          <Link
            to={`/users/${
              uid || auth.currentUser?.uid
            }/collections/${collectionId}/categories/${categoryId}/edit`}
            className="fav-star empty"
            aria-label="Edit category"
            title="Edit category"
          >
            <img src={settingsIcon} alt="" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="search-container">
        <input
          type="search"
          onChange={onSearchChange}
          placeholder={`Search in ${cat?.title || "category"}`}
          className="search-input"
          aria-label="Search items in category"
        />
        {searching && <span>Searching…</span>}
      </div>

      {visibleItems.length === 0 ? (
        <div>
          <h3 className="aftersignup-subtitle">
            No items in this category yet. Add your first item!
          </h3>
        </div>
      ) : (
        <div
          className="hscroll-strip author-page-items"
          style={{ marginTop: 10 }}
        >
          {visibleItems.map((it) => (
            <article
              key={it.id}
              className="collection-card"
              aria-label={it.title}
            >
              <Link
                to={`/users/${
                  uid || auth.currentUser?.uid
                }/collections/${collectionId}/items/${it.id}`}
                aria-label={`View ${it.title}`}
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
              </Link>

              <h3 className="item-title" title={it.title}>
                {it.title}
              </h3>
              {it.author ? <p className="item-sub">{it.author}</p> : null}
            </article>
          ))}
        </div>
      )}

      <div className="landing-page-btns" style={{ marginTop: 20 }}>
        <Link
          to={`/users/${
            uid || auth.currentUser?.uid
          }/collections/${collectionId}/categories/${cat?.id}/remove-items`}
          className="login-btn"
          aria-label="Remove items from category"
        >
          Remove items
        </Link>

        <Link
          to={`/users/${
            uid || auth.currentUser?.uid
          }/collections/${collectionId}/categories/${cat?.id}/add-items`}
          className="get-started-btn"
          aria-label="Add items to this category"
        >
          Add items +
        </Link>
      </div>

      <Nav />
    </main>
  );
}
