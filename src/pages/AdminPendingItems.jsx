import { useEffect, useState } from "react";
import {
  ref as dbRef,
  onValue,
  serverTimestamp,
  get,
  set,
  push,
} from "firebase/database";
import { db, auth } from "../../firebase-config";

const VALID_TYPES = ["book", "album", "vinyl"];

function isValidHttpsUrl(str) {
  try {
    const u = new URL(String(str || "").trim());
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

export default function AdminPendingItems() {
  const [pendingItems, setPendingItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [formState, setFormState] = useState({});

  // Hent alle pending items
  useEffect(() => {
    const pendingRef = dbRef(db, "pendingItems");
    const unsubscribe = onValue(pendingRef, (snapshot) => {
      const data = snapshot.val() || {};
      const arr = Object.entries(data)
        .filter(([, val]) => val && VALID_TYPES.includes(val.type))
        .map(([key, val]) => ({ ...val, id: key }));
      setPendingItems(arr);
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  useEffect(() => {
    (async () => {
      const user = auth.currentUser;
      if (!user) return console.warn("Not logged in");
      try {
        const snap = await get(dbRef(db, `admins/${user.uid}`));
        console.log(
          "DEBUG: admins/<uid> value:",
          snap.exists() ? snap.val() : null
        );
      } catch (err) {
        console.error("Failed to fetch admin flag:", err);
      }
    })();
  }, []);

  const setField = (itemId, field, value) => {
    setFormState((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || {}),
        [field]: value,
      },
    }));
  };

  const approveItem = async (item) => {
    if (!item?.id) return alert("Item is missing an ID!");
    if (!VALID_TYPES.includes(item.type)) {
      return alert("Couldn't approve items in placeholder collection");
    }

    const itemId = item.id;
    setLoadingItems((prev) => ({ ...prev, [itemId]: true }));

    try {
      const local = formState[itemId] || {};
      const description = (local.description || "").trim();
      const tagsText = (local.tagsText || "").trim();
      const tags = tagsText
        ? tagsText
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      let coverUrl = "";
      if (local.coverUrl && local.coverUrl.trim() !== "") {
        if (!isValidHttpsUrl(local.coverUrl)) {
          throw new Error("Cover image URL needs to be a valid https:// URL.");
        }
        coverUrl = local.coverUrl.trim();
      } else if (item.coverImage) {
        coverUrl = item.coverImage;
      }

      const now = serverTimestamp();

      const userCollectionRef = dbRef(
        db,
        `users/${item.createdBy}/collectionItems`
      );
      const newUserItemRef = push(userCollectionRef);
      const newUserItemId = newUserItemRef.key;

      const userCollectionPayload = {
        id: newUserItemId,
        sourceItemId: itemId,
        title: (item.title || "").trim(),
        author: (item.author || "").trim(),
        coverImage: coverUrl || item.coverImage || null,
        type: item.type || "",
        createdAt: now,
        updatedAt: now,
      };

      await set(newUserItemRef, userCollectionPayload);
      await set(
        dbRef(db, `users/${item.createdBy}/collectionItems/_placeholder`),
        true
      );

      const flatGlobalPath = `items/${itemId}`;
      const existingGlobalSnap = await get(dbRef(db, flatGlobalPath));

      const flatGlobalData = {
        author: (item.author || "").trim(),
        title: (item.title || "").trim(),
        description: description || "",
        type: item.type,
        images: {
          cover: coverUrl || item.coverImage || "" || "",
        },
        external: {
          link: (item.link || "").trim(),
        },
        tags: tags,
        createdBy: item.createdBy || null,
        approvedBy: auth?.currentUser?.uid || null,
        status: "approved",
        createdAt:
          existingGlobalSnap && existingGlobalSnap.exists()
            ? existingGlobalSnap.val().createdAt || now
            : now,
        updatedAt: now,
      };

      await set(dbRef(db, flatGlobalPath), flatGlobalData);

      // slet fra pendingItems
      await set(dbRef(db, `pendingItems/${itemId}`), null);

      setPendingItems((prev) => prev.filter((it) => it.id !== itemId));
      setFormState((prev) => {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      });

      alert(`Item "${item.title}" approved!`);
    } catch (err) {
      console.error("Approve error:", err);
      alert(
        "Something went wrong with the approval. Check database-rules and admin-access. Error: " +
          (err?.message || err)
      );
    } finally {
      setLoadingItems((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  const rejectItem = async (item) => {
    if (!item?.id) return alert("Item is missing an ID!");
    const itemId = item.id;
    setLoadingItems((prev) => ({ ...prev, [itemId]: true }));

    try {
      await set(dbRef(db, `pendingItems/${itemId}`), null);
      setPendingItems((prev) => prev.filter((it) => it.id !== itemId));
      alert(`Item "${item.title}" rejected!`);
    } catch (err) {
      console.error("Reject error:", err);
      alert(
        "Something went wrong with the rejection. Check database-rules and admin-access."
      );
    } finally {
      setLoadingItems((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  return (
    <div>
      <h1 className="page-title">Pending Items for Approval</h1>

      {pendingItems.length === 0 ? (
        <p className="empty">No items pending approval.</p>
      ) : (
        <ul className="pending-list">
          {pendingItems.map((item) => {
            const itemId = item.id;
            const local = formState[itemId] || {};
            return (
              <li key={itemId || item.title} className="pending-item">
                <div className="item-info">
                  <div className="item-main-row">
                    <strong className="item-title">{item.title}</strong>
                    <span className="item-type">({item.type})</span>
                  </div>

                  <div className="item-meta">
                    by <span className="item-author">{item.author}</span>
                  </div>

                  <div className="item-link">
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View Link
                    </a>
                  </div>

                  <div className="expand-btn-wrap">
                    <button
                      className="btn"
                      onClick={() =>
                        setExpandedId((prev) =>
                          prev === itemId ? null : itemId
                        )
                      }
                    >
                      {expandedId === itemId
                        ? "Close details / hide admin fields"
                        : "Open details / show admin fields"}
                    </button>
                  </div>
                </div>

                <div className="item-actions">
                  <button
                    className="btn btn-approve"
                    onClick={() => approveItem(item)}
                    disabled={loadingItems[itemId]}
                  >
                    {loadingItems[itemId] ? "Processing..." : "Approve"}
                  </button>

                  <button
                    className="btn btn-reject"
                    onClick={() => rejectItem(item)}
                    disabled={loadingItems[itemId]}
                  >
                    {loadingItems[itemId] ? "Processing..." : "Reject"}
                  </button>
                </div>

                {expandedId === itemId && (
                  <div className="admin-edit-section">
                    <label className="admin-label">Description</label>
                    <textarea
                      className="admin-textarea"
                      rows={4}
                      value={local.description || ""}
                      onChange={(e) =>
                        setField(itemId, "description", e.target.value)
                      }
                      placeholder="Write a short description."
                    />

                    <label className="admin-label">
                      Tags (comma separated)
                    </label>
                    <input
                      className="admin-input"
                      type="text"
                      value={local.tagsText || ""}
                      onChange={(e) =>
                        setField(itemId, "tagsText", e.target.value)
                      }
                      placeholder="ex. romance, mystery, fantasy"
                    />

                    <label className="admin-label">
                      Cover image URL (https)
                    </label>
                    <input
                      className="admin-input"
                      type="url"
                      value={local.coverUrl || ""}
                      onChange={(e) =>
                        setField(itemId, "coverUrl", e.target.value)
                      }
                      placeholder="https://example.com/cover.jpg"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
