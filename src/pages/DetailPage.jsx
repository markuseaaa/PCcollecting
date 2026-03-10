import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import { db, auth } from "../../firebase-config";
import {
  ref as dbRef,
  get,
  push,
  update,
  remove,
  onValue,
  off,
} from "firebase/database";
import Nav from "../components/Nav";
import backArrow from "../assets/icons/backarrow.svg";
import favourites from "../assets/icons/favourites.svg";
import favouritesFilled from "../assets/icons/favourites-filled.svg";

export default function DetailPage() {
  const { id, uid: routeUid, collectionId } = useParams();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [processing, setProcessing] = useState(false);
  const [isInUserCollection, setIsInUserCollection] = useState(false);
  const [userCollectionItemId, setUserCollectionItemId] = useState(null);

  const navigate = useNavigate();

  const [isInWishlist, setIsInWishlist] = useState(false);

  const [isItemFavorited, setIsItemFavorited] = useState(false);
  const [isAuthorFavorited, setIsAuthorFavorited] = useState(false);

  const comparableIdRef = useRef(null);

  async function fetchGlobalItem(globalId) {
    if (!globalId) return null;
    const snap = await get(dbRef(db, `items/${globalId}`));
    return snap.exists() ? { id: snap.key, ...snap.val() } : null;
  }

  async function fetchUserCollectionItem(userId, collItemId) {
    const snap = await get(
      dbRef(db, `users/${userId}/collectionItems/${collItemId}`)
    );
    return snap.exists() ? { id: snap.key, ...snap.val() } : null;
  }

  async function findUserCollectionItemBySource(userId, globalId) {
    const snap = await get(dbRef(db, `users/${userId}/collectionItems`));
    if (!snap.exists()) return null;
    let found = null;
    snap.forEach((ch) => {
      const val = ch.val();
      if (val?.sourceItemId === globalId || ch.key === globalId) {
        found = { id: ch.key, ...val };
        return true;
      }
    });
    return found;
  }

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    setItem(null);
    setIsInUserCollection(false);
    setUserCollectionItemId(null);
    setIsInWishlist(false);
    setIsItemFavorited(false);
    setIsAuthorFavorited(false);
    comparableIdRef.current = null;

    (async () => {
      try {
        const currentUid = auth.currentUser?.uid;

        if (routeUid) {
          const userItem = await fetchUserCollectionItem(routeUid, id);
          if (userItem) {
            if (mounted) {
              setIsInUserCollection(currentUid === routeUid);
              setUserCollectionItemId(userItem.id);
            }
            const global = userItem.sourceItemId
              ? await fetchGlobalItem(userItem.sourceItemId)
              : null;
            const merged = {
              ...global,
              ...userItem,
              images: {
                ...(global?.images || {}),
                ...(userItem?.images || {}),
              },
              external: {
                ...(global?.external || {}),
                ...(userItem?.external || {}),
              },
            };
            if (mounted) setItem(merged);
            comparableIdRef.current =
              userItem.sourceItemId || userItem.id || null;
            if (mounted) setLoading(false);
            return;
          }

          const foundBySource = await findUserCollectionItemBySource(
            routeUid,
            id
          );
          if (foundBySource) {
            if (mounted) {
              setIsInUserCollection(currentUid === routeUid);
              setUserCollectionItemId(foundBySource.id);
            }
            const global = await fetchGlobalItem(foundBySource.sourceItemId);
            const merged = {
              ...global,
              ...foundBySource,
              images: {
                ...(global?.images || {}),
                ...(foundBySource?.images || {}),
              },
              external: {
                ...(global?.external || {}),
                ...(foundBySource?.external || {}),
              },
            };
            if (mounted) setItem(merged);
            comparableIdRef.current =
              foundBySource.sourceItemId || foundBySource.id || null;
            if (mounted) setLoading(false);
            return;
          }
        }

        const globalItem = await fetchGlobalItem(id);
        if (globalItem) {
          if (mounted) setItem(globalItem);
          comparableIdRef.current =
            globalItem.sourceItemId || globalItem.id || null;
          if (mounted) setLoading(false);

          if (currentUid) {
            const userCopy = await findUserCollectionItemBySource(
              currentUid,
              id
            );
            if (userCopy && mounted) {
              setIsInUserCollection(true);
              setUserCollectionItemId(userCopy.id);
            }
          }
          return;
        }

        if (routeUid && collectionId) {
          try {
            const categoriesSnap = await get(
              dbRef(
                db,
                `users/${routeUid}/collections/${collectionId}/categories`
              )
            );
            if (categoriesSnap.exists()) {
              let possibleCollItemId = null;
              categoriesSnap.forEach((catCh) => {
                const catVal = catCh.val();
                if (catVal?.items && typeof catVal.items === "object") {
                  if (catVal.items[id]) {
                    possibleCollItemId = id;
                    return true;
                  }
                }
              });
              if (possibleCollItemId) {
                const found = await fetchUserCollectionItem(
                  routeUid,
                  possibleCollItemId
                );
                if (found) {
                  if (mounted) {
                    setIsInUserCollection(auth.currentUser?.uid === routeUid);
                    setUserCollectionItemId(found.id);
                  }
                  const global = await fetchGlobalItem(found.sourceItemId);
                  const merged = {
                    ...global,
                    ...found,
                    images: {
                      ...(global?.images || {}),
                      ...(found?.images || {}),
                    },
                    external: {
                      ...(global?.external || {}),
                      ...(found?.external || {}),
                    },
                  };
                  if (mounted) setItem(merged);
                  comparableIdRef.current =
                    found.sourceItemId || found.id || null;
                  if (mounted) setLoading(false);
                  return;
                }
              }
            }
          } catch {
            // ignore
          }
        }

        if (mounted) {
          setError("Item not found.");
          setLoading(false);
        }
      } catch (err) {
        console.error("DetailPage fetch error:", err);
        if (mounted) {
          setError("There was an error fetching the item.");
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id, routeUid, collectionId]);

  useEffect(() => {
    const unsubscribers = [];

    const attachListenersForUser = (uid) => {
      const wlRef = dbRef(db, `users/${uid}/wishlist`);
      const wlListener = (snap) => {
        const compId = comparableIdRef.current;
        if (!compId) {
          setIsInWishlist(false);
          return;
        }
        if (!snap.exists()) {
          setIsInWishlist(false);
          return;
        }
        let found = false;
        snap.forEach((ch) => {
          const val = ch.val();
          if (val?.sourceItemId === compId || val?.itemId === compId) {
            found = true;
            return true;
          }
        });
        setIsInWishlist(found);
      };
      onValue(wlRef, wlListener);
      unsubscribers.push(() => off(wlRef, "value", wlListener));

      const favItemsRef = dbRef(db, `users/${uid}/favourites/items`);
      const favItemsListener = (snap) => {
        const compId = comparableIdRef.current;
        if (!compId) {
          setIsItemFavorited(false);
          return;
        }
        if (!snap.exists()) {
          setIsItemFavorited(false);
          return;
        }

        let found = false;
        snap.forEach((ch) => {
          if (ch.key === compId) {
            found = true;
            return true;
          }
          const val = ch.val();
          if (val?.sourceItemId === compId || val?.itemId === compId) {
            found = true;
            return true;
          }
        });
        setIsItemFavorited(found);
      };
      onValue(favItemsRef, favItemsListener);
      unsubscribers.push(() => off(favItemsRef, "value", favItemsListener));

      const favAuthorsRef = dbRef(db, `users/${uid}/favourites/authors`);
      const favAuthorsListener = (snap) => {
        const authorName = (item?.author || "").toString().trim();
        if (!authorName) {
          setIsAuthorFavorited(false);
          return;
        }
        if (!snap.exists()) {
          setIsAuthorFavorited(false);
          return;
        }

        const encoded = encodeURIComponent(authorName.toLowerCase());
        let found = false;
        snap.forEach((ch) => {
          if (ch.key === encoded) {
            found = true;
            return true;
          }
          const val = ch.val();
          if (val?.author && val.author === authorName) {
            found = true;
            return true;
          }
        });
        setIsAuthorFavorited(found);
      };
      onValue(favAuthorsRef, favAuthorsListener);
      unsubscribers.push(() => off(favAuthorsRef, "value", favAuthorsListener));
    };

    const user = auth.currentUser;
    if (user && user.uid) {
      attachListenersForUser(user.uid);
    }

    return () => {
      unsubscribers.forEach((fn) => fn());
    };
  }, [item]);

  async function handleAddToWishlist() {
    setError("");
    setProcessing(true);
    try {
      const user = auth.currentUser;
      if (!user?.uid)
        throw new Error("You need to be logged in to add to wishlist.");
      const uid = user.uid;

      const compId = comparableIdRef.current || item?.id || item?.sourceItemId;
      if (!compId) throw new Error("Could not determine item ID.");

      const wishlistSnap = await get(dbRef(db, `users/${uid}/wishlist`));
      if (wishlistSnap.exists()) {
        let already = false;
        wishlistSnap.forEach((ch) => {
          const val = ch.val();
          if (val?.sourceItemId === compId || val?.itemId === compId) {
            already = true;
            return true;
          }
        });
        if (already) {
          setIsInWishlist(true);
          setProcessing(false);
          return;
        }
      }

      const newRef = push(dbRef(db, `users/${uid}/wishlist`));
      const payload = {
        id: newRef.key,
        itemId: compId,
        sourceItemId: compId,
        title: item?.title || "",
        author: item?.author || "",
        coverImage: item?.images?.cover || item?.coverImage || null,
        createdAt: Date.now(),
      };

      await update(dbRef(db), {
        [`users/${uid}/wishlist/${newRef.key}`]: payload,
      });

      setIsInWishlist(true);
      setProcessing(false);
    } catch (err) {
      console.error("Add to wishlist error:", err);
      setError(err?.message || "Could not add to wishlist.");
      setProcessing(false);
    }
  }

  async function handleRemoveFromWishlist() {
    setError("");
    setProcessing(true);
    try {
      const user = auth.currentUser;
      if (!user?.uid)
        throw new Error("You need to be logged in to remove from wishlist.");
      const uid = user.uid;

      const compId = comparableIdRef.current || item?.id || item?.sourceItemId;
      if (!compId) throw new Error("Could not determine item ID.");

      const wishlistSnap = await get(dbRef(db, `users/${uid}/wishlist`));
      if (!wishlistSnap.exists()) {
        setIsInWishlist(false);
        setProcessing(false);
        return;
      }

      const removals = [];
      wishlistSnap.forEach((ch) => {
        const val = ch.val();
        if (val?.sourceItemId === compId || val?.itemId === compId) {
          removals.push(ch.key);
        }
      });

      if (removals.length === 0) {
        setIsInWishlist(false);
        setProcessing(false);
        return;
      }

      const updates = {};
      removals.forEach((key) => {
        updates[`users/${uid}/wishlist/${key}`] = null;
      });

      await update(dbRef(db), updates);

      setIsInWishlist(false);
      setProcessing(false);
    } catch (err) {
      console.error("Remove from wishlist error:", err);
      setError(err?.message || "Could not remove from wishlist.");
      setProcessing(false);
    }
  }

  async function handleToggleFavouriteItem() {
    setError("");
    setProcessing(true);
    try {
      const user = auth.currentUser;
      if (!user?.uid)
        throw new Error("You need to be logged in to change favourites.");
      const uid = user.uid;

      const compId = comparableIdRef.current || item?.id || item?.sourceItemId;
      if (!compId) throw new Error("Could not determine item ID.");

      const favPath = `users/${uid}/favourites/items/${compId}`;
      const favRef = dbRef(db, favPath);

      const snap = await get(favRef);
      if (snap.exists()) {
        await remove(favRef);
        setIsItemFavorited(false);
      } else {
        const payload = {
          id: compId,
          itemId: compId,
          sourceItemId: compId,
          title: item?.title || "",
          author: item?.author || "",
          coverImage: item?.images?.cover || item?.coverImage || null,
          createdAt: Date.now(),
        };
        await update(dbRef(db), { [favPath]: payload });
        setIsItemFavorited(true);
      }

      setProcessing(false);
    } catch (err) {
      console.error("Toggle favourite item error:", err);
      setError(err?.message || "Could not update favourite for item.");
      setProcessing(false);
    }
  }

  async function handleToggleFavouriteAuthor() {
    setError("");
    setProcessing(true);
    try {
      const user = auth.currentUser;
      if (!user?.uid)
        throw new Error("You need to be logged in to change favourites.");
      const uid = user.uid;

      const authorName = (item?.author || "").toString().trim();
      if (!authorName) throw new Error("No author found.");

      const key = encodeURIComponent(authorName.toLowerCase());
      const favPath = `users/${uid}/favourites/authors/${key}`;
      const favRef = dbRef(db, favPath);

      const snap = await get(favRef);
      if (snap.exists()) {
        await remove(favRef);
        setIsAuthorFavorited(false);
      } else {
        const payload = {
          id: key,
          author: authorName,
          createdAt: Date.now(),
        };
        await update(dbRef(db), { [favPath]: payload });
        setIsAuthorFavorited(true);
      }

      setProcessing(false);
    } catch (err) {
      console.error("Toggle favourite author error:", err);
      setError(err?.message || "Could not update favourite for author.");
      setProcessing(false);
    }
  }

  async function handleDeleteFromCollection() {
    setProcessing(true);
    try {
      const user = auth.currentUser;
      if (!user?.uid) throw new Error("You must be logged in.");
      const uid = user.uid;
      if (!userCollectionItemId) throw new Error("No item ID found.");

      await remove(
        dbRef(db, `users/${uid}/collectionItems/${userCollectionItemId}`)
      );

      const collectionsSnap = await get(dbRef(db, `users/${uid}/collections`));
      if (collectionsSnap.exists()) {
        const updates = {};
        collectionsSnap.forEach((collCh) => {
          const collVal = collCh.val();
          if (collVal?.categories) {
            Object.entries(collVal.categories).forEach(([catKey, catVal]) => {
              if (catVal?.items && catVal.items[userCollectionItemId]) {
                updates[
                  `users/${uid}/collections/${collCh.key}/categories/${catKey}/items/${userCollectionItemId}`
                ] = null;
              }
            });
          }
        });
        if (Object.keys(updates).length > 0) {
          await update(dbRef(db), updates);
        }
      }

      setIsInUserCollection(false);
      setUserCollectionItemId(null);
      setProcessing(false);
    } catch (err) {
      console.error("Delete from collection error:", err);
      setError(err?.message || "Could not delete item from collection.");
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <main className="item-page">
        <p className="loading-text">Henter item…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="item-page">
        <p className="error-text">{error}</p>
        <Nav />
      </main>
    );
  }

  const title = item?.title || "Untitled";
  const author = item?.author || "Unknown";
  const cover = item?.images?.cover || item?.coverImage || "/placeholder.png";
  const tags = item?.tags || [];
  const description = item?.description || item?.summary || "";

  const currentUid = auth.currentUser?.uid;
  const canDelete =
    isInUserCollection &&
    currentUid &&
    (routeUid ? routeUid === currentUid : true);

  return (
    <main className="item-page">
      <button
        onClick={() => navigate(-1)}
        className="back-arrow-link"
        aria-label="Go back"
      >
        <img src={backArrow} alt="Back" className="back-arrow" />
      </button>

      <div className="item-card">
        <div className="item-body">
          <div className="title-row">
            <h1 className="page-title detail-page-item-title">{title}</h1>

            <button
              className={`fav-star ${isItemFavorited ? "filled" : "empty"}`}
              onClick={handleToggleFavouriteItem}
              aria-pressed={isItemFavorited}
              title={
                isItemFavorited
                  ? "Remove item from favourites"
                  : "Add item to favourites"
              }
              disabled={processing}
            >
              <img
                src={isItemFavorited ? favouritesFilled : favourites}
                alt="favourite item"
              />
            </button>
          </div>

          <div className="author-row">
            <div className="item-author">{author}</div>

            <button
              className={`fav-star author ${
                isAuthorFavorited ? "filled" : "empty"
              }`}
              onClick={handleToggleFavouriteAuthor}
              aria-pressed={isAuthorFavorited}
              title={
                isAuthorFavorited
                  ? "Remove author from favourites"
                  : "Add author to favourites"
              }
              disabled={processing}
            >
              <img
                src={isAuthorFavorited ? favouritesFilled : favourites}
                alt="favourite author"
              />
            </button>
          </div>

          {tags.length > 0 && (
            <ul className="item-tags">
              {tags.map((t, i) => (
                <li key={i} className="tag">
                  {t}
                </li>
              ))}
            </ul>
          )}

          <div>
            <div>
              {cover ? (
                <img
                  className="item-cover gradient-frame"
                  src={cover}
                  alt={title}
                />
              ) : (
                <div className="item-cover placeholder">No image</div>
              )}
            </div>

            <div>
              <p className="item-description">{description}</p>

              <div className="item-actions">
                {canDelete ? (
                  <button
                    className="wishlist-btn login-btn"
                    onClick={handleDeleteFromCollection}
                    disabled={processing}
                  >
                    {processing ? "Deleting…" : "Delete"}
                  </button>
                ) : (
                  <button
                    className={`wishlist-btn login-btn ${
                      isInWishlist ? "added" : ""
                    }`}
                    onClick={
                      processing
                        ? undefined
                        : isInWishlist
                        ? handleRemoveFromWishlist
                        : handleAddToWishlist
                    }
                    disabled={processing}
                  >
                    {processing
                      ? isInWishlist
                        ? "Removing…"
                        : "Adding…"
                      : isInWishlist
                      ? "Remove from wishlist"
                      : "Add to wishlist"}
                  </button>
                )}

                {item?.external?.link ? (
                  <a
                    className="getit-btn get-started-btn"
                    href={item.external.link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Get it here
                  </a>
                ) : (
                  <button className="getit-btn disabled" disabled>
                    Get it here
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Nav />
    </main>
  );
}
