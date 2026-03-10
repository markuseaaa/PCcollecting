import { useEffect, useState } from "react";
import { Link } from "react-router";
import { auth, db } from "../../firebase-config";
import { ref, get, child, onValue, off } from "firebase/database";
import Nav from "../components/Nav";

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
    val.coverImage,
    val.cover,
    val.imageUrl,
    val.image,
    val.thumbnail,
    val?.images?.cover,
    val?.volumeInfo?.imageLinks?.thumbnail,
  ];
  let u = (
    candidates.find((x) => typeof x === "string" && x.trim()) || ""
  ).trim();
  return u.replace(/^["']|["']$/g, "");
}

export default function HomePage() {
  const [username, setUsername] = useState("");
  const [cols, setCols] = useState([]);
  const [favItems, setFavItems] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [loadingCols, setLoadingCols] = useState(true);
  const [loadingFav, setLoadingFav] = useState(true);
  const [loadingWish, setLoadingWish] = useState(true);

  useEffect(() => {
    async function fetchUsername() {
      const user = auth.currentUser;
      if (!user) return;
      if (user.displayName) {
        setUsername(user.displayName);
        return;
      }
      try {
        const snap = await get(child(ref(db), `users/${user.uid}/username`));
        if (snap.exists()) setUsername(snap.val());
      } catch (e) {
        console.warn("Username load failed", e);
      }
    }
    fetchUsername();
  }, []);

  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) {
      setCols([]);
      setLoadingCols(false);
      return;
    }
    const r = ref(db, `users/${uid}/collections`);
    const unsub = onValue(
      r,
      (snap) => {
        const val = snap.val() || {};
        const list = Object.keys(val)
          .filter((k) => !k.startsWith("_"))
          .map((k) => ({ id: k, ...val[k] }))
          .sort(
            (a, b) =>
              (b.updatedAt || b.createdAt || 0) -
              (a.updatedAt || a.createdAt || 0)
          );
        setCols(list);
        setLoadingCols(false);
      },
      () => {
        setCols([]);
        setLoadingCols(false);
      }
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setFavItems([]);
      setLoadingFav(false);
      return;
    }
    const favRef = ref(db, `users/${uid}/favourites/items`);
    const listener = async (snap) => {
      if (!snap.exists()) {
        setFavItems([]);
        setLoadingFav(false);
        return;
      }
      const ids = [];
      const created = {};
      snap.forEach((ch) => {
        ids.push(ch.key);
        const v = ch.val();
        if (v && typeof v === "object" && v.createdAt)
          created[ch.key] = Number(v.createdAt);
      });

      const hydrated = await Promise.all(
        ids.map(async (id) => {
          const local = await get(
            ref(db, `users/${uid}/collectionItems/${id}`)
          );
          if (local.exists()) {
            const v = local.val() || {};
            return {
              id,
              title: v.title || "Untitled",
              coverImage: pickImage(v),
              type: normType(v.type),
              createdAt: created[id] || Number(v.createdAt || 0),
            };
          }
          const global = await get(ref(db, `items/${id}`));
          if (global.exists()) {
            const v = global.val() || {};
            return {
              id,
              title: v.title || "Untitled",
              coverImage: pickImage(v),
              type: normType(v.type),
              createdAt: created[id] || Number(v.createdAt || 0),
            };
          }
          return {
            id,
            title: "Untitled",
            coverImage: "",
            type: "",
            createdAt: 0,
          };
        })
      );

      hydrated.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setFavItems(hydrated);
      setLoadingFav(false);
    };
    onValue(favRef, listener);
    return () => off(favRef, "value", listener);
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setWishlist([]);
      setLoadingWish(false);
      return;
    }

    const refWish = ref(db, `users/${uid}/wishlist`);
    const listener = (snap) => {
      if (!snap.exists()) {
        setWishlist([]);
        setLoadingWish(false);
        return;
      }

      const list = [];
      snap.forEach((ch) => {
        const val = ch.val() || {};
        if (ch.key === "_placeholder") return;

        list.push({
          id: ch.key,
          itemId: val.itemId || ch.key,
          title: val.title || "Untitled",
          coverImage: pickImage(val),
          type: normType(val.type),
          createdAt: Number(val.createdAt || 0),
        });
      });

      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setWishlist(list);
      setLoadingWish(false);
    };

    onValue(refWish, listener);
    return () => off(refWish, "value", listener);
  }, [uid]);

  return (
    <main style={{ paddingBottom: 130 }}>
      <section className="landing-container">
        <div className="landing-text">
          <h1 className="page-title">
            Welcome <span className="gradient-text">{username || "..."}!</span>
          </h1>
        </div>
      </section>

      <section>
        <h3
          className="aftersignup-subtitle-collection"
          style={{ marginBottom: -5 }}
        >
          My collections
        </h3>
        {loadingCols ? (
          <p>Loading…</p>
        ) : cols.length === 0 ? (
          <p>You don’t have any collections yet.</p>
        ) : (
          <div className="categories-strip">
            {cols.map((col) => (
              <Link
                key={col.id}
                to={`/users/${uid}/collections/${col.id}`}
                className="cover-frame"
                aria-label={`Open collection ${col.title}`}
              >
                <article className="category-card">
                  {col.coverImage && (
                    <img
                      src={col.coverImage}
                      alt={col.title || "Collection cover"}
                      className="category-cover"
                      loading="lazy"
                    />
                  )}
                  <h3 className="category-title">
                    {col.title || col.slug || "Untitled"}
                  </h3>
                </article>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="aftersignup-subtitle-collection">My favourites</h3>
        {loadingFav ? (
          <p>Loading…</p>
        ) : favItems.length === 0 ? (
          <p>You have no favourite items yet.</p>
        ) : (
          <div className="hscroll-strip no-scrollbar">
            {favItems.map((it) => (
              <Link
                key={it.id}
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
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="aftersignup-subtitle-collection">My wishlist</h3>
        {loadingWish ? (
          <p>Loading…</p>
        ) : wishlist.length === 0 ? (
          <p>Your wishlist is empty.</p>
        ) : (
          <div className="hscroll-strip no-scrollbar">
            {wishlist.map((it) => (
              <Link
                key={it.id}
                to={`/items/${it.itemId}`}
                className="collection-card"
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
                <h3 className="item-title">{it.title}</h3>
              </Link>
            ))}
          </div>
        )}
      </section>

      <Nav />
    </main>
  );
}
