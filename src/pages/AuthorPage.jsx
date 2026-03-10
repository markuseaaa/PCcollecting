import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { db, auth } from "../../firebase-config";
import { ref as dbRef, get } from "firebase/database";
import Nav from "../components/Nav";
import backArrow from "../assets/icons/backarrow.svg";

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
  return (candidates.find((x) => typeof x === "string" && x && x.trim()) || "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function normType(t) {
  const x = (t || "").toLowerCase();
  if (x === "books") return "book";
  if (x === "albums") return "album";
  if (x === "vinyl") return "vinyl";
  if (x === "book") return "book";
  if (x === "album") return "album";
  return x || "other";
}

export default function AuthorPage() {
  const { authorKey } = useParams();
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [ownedMap, setOwnedMap] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const allSnap = await get(dbRef(db, "items"));
        const all = allSnap.exists() ? allSnap.val() || {} : {};

        const decodedAuthor = decodeURIComponent(authorKey || "").toLowerCase();
        const matching = [];

        Object.entries(all).forEach(([key, val]) => {
          if (!val) return;
          const authorStr = (val.author || val.artist || "")
            .toString()
            .trim()
            .toLowerCase();
          if (authorStr && authorStr === decodedAuthor) {
            matching.push({
              id: key,
              title: val.title || val.name || "Untitled",
              author: val.author || val.artist || "",
              coverImage: pickImage(val),
              type: normType(val.type),
              raw: val,
            });
          }
        });

        const currentUid = auth.currentUser?.uid;
        const owned = new Set();

        if (currentUid) {
          const userSnap = await get(
            dbRef(db, `users/${currentUid}/collectionItems`)
          );
          if (userSnap.exists()) {
            const obj = userSnap.val() || {};
            Object.entries(obj).forEach(([k, v]) => {
              if (!v) return;
              if (v.sourceItemId) owned.add(String(v.sourceItemId));
              owned.add(String(k));
            });
          }
        }

        if (!alive) return;
        setItems(matching);
        setOwnedMap(owned);
        setLoading(false);
      } catch (e) {
        console.error("AuthorPage load error", e);
        if (!alive) return;
        setErr("Could not load items for author.");
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [authorKey]);

  const itemsByType = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const t = normType(it.type || "other");
      if (!map.has(t)) map.set(t, []);
      map.get(t).push(it);
    }
    return map;
  }, [items]);

  if (loading) {
    return (
      <main className="landing-container">
        <h1 className="page-title">Loading author…</h1>
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

  const decodedAuthor = decodeURIComponent(authorKey || "");
  const rows = [...itemsByType.entries()];

  return (
    <main style={{ paddingBottom: 140 }}>
      <div>
        <button
          onClick={() => navigate(-1)}
          className="back-arrow-link"
          aria-label="Go back"
        >
          <img src={backArrow} alt="Back" className="back-arrow" />
        </button>
        <h1 className="page-title">{decodedAuthor}</h1>
      </div>

      {rows.length === 0 ? (
        <p className="aftersignup-subtitle">No items found for this author.</p>
      ) : (
        rows.map(([t, list]) => (
          <section key={t}>
            <div className="hscroll-strip author-page-items">
              {list.map((it) => {
                const compId = it.id;
                const owned = ownedMap.has(String(compId));
                return (
                  <Link
                    key={it.id}
                    to={`/items/${it.id}`}
                    className={`collection-card ${owned ? "" : "is-missing"}`}
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
                    {!owned && <div className="missing-badge">Missing</div>}
                  </Link>
                );
              })}
            </div>
          </section>
        ))
      )}

      <Nav />
    </main>
  );
}
