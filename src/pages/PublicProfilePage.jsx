import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ref, get } from "firebase/database";
import { auth, db } from "../../firebase-config";
import StorageImage from "../components/StorageImage";
import Nav from "../components/Nav";

function mapPublicCollections(value) {
  return Object.keys(value || {})
    .filter((k) => !k.startsWith("_"))
    .map((k) => ({ id: k, ...value[k] }))
    .filter((collection) => String(collection.visibility || "public").toLowerCase() !== "private")
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}

export default function PublicProfilePage() {
  const { uid } = useParams();
  const [username, setUsername] = useState("collector");
  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [collections, setCollections] = useState([]);
  const [friendCount, setFriendCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!uid) {
        setError("Profile not found.");
        setLoading(false);
        return;
      }
      try {
        const [userSnap, collectionSnap] = await Promise.all([
          get(ref(db, `users/${uid}`)),
          get(ref(db, `users/${uid}/collections`)),
        ]);
        if (!alive) return;
        if (!userSnap.exists()) {
          setError("Profile not found.");
          setLoading(false);
          return;
        }
        const userVal = userSnap.val() || {};
        setUsername(String(userVal.username || "collector"));
        setBio(String(userVal.bio || ""));
        setPhotoUrl(String(userVal.profilePhotoUrl || ""));
        setFriendCount(
          Object.keys(userVal.friends || {}).filter((k) => !k.startsWith("_")).length
        );

        const colVal = collectionSnap.exists() ? collectionSnap.val() : {};
        setCollections(mapPublicCollections(colVal));
      } catch (err) {
        if (!alive) return;
        setError(err?.message || "Could not load public profile.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [uid]);

  const isMe = useMemo(() => auth.currentUser?.uid === uid, [uid]);

  return (
    <main className="page-content with-nav-space">
      <section className="section-block profile-card">
        {loading ? <p className="muted">Loading profile...</p> : null}
        {!loading && error ? <p className="error-text">{error}</p> : null}
        {!loading && !error ? (
          <>
            <div className="profile-head">
              <StorageImage src={photoUrl} alt={username} className="profile-avatar" />
              <div>
                <h1>{username}</h1>
                <p className="muted">{bio || "No bio yet."}</p>
                <p className="muted">{friendCount} friends</p>
              </div>
            </div>
            {isMe ? (
              <Link to="/profile" className="btn btn-ghost small">
                Edit my profile
              </Link>
            ) : null}
          </>
        ) : null}
      </section>

      {!loading && !error ? (
        <section className="section-block">
          <h2>Public collections</h2>
          {collections.length === 0 ? (
            <p className="muted">No public collections yet.</p>
          ) : (
            <div className="collection-grid">
              {collections.map((collection) => (
                <Link
                  key={collection.id}
                  to={`/users/${uid}/collections/${collection.id}`}
                  className="collection-tile"
                >
                  <StorageImage
                    src={collection.coverImage || ""}
                    thumbPath={collection.coverThumbPath}
                    imagePath={collection.coverImagePath}
                    alt={collection.title || "Collection"}
                    thumbOnly
                  />
                  <div>
                    <p className="collection-title">{collection.title || "Untitled"}</p>
                    <p className="collection-description">
                      {collection.description || "Photocard binder"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <Nav />
    </main>
  );
}
