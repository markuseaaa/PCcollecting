import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { signOut } from "firebase/auth";
import { ref, get } from "firebase/database";
import { auth, db } from "../../firebase-config";
import { hasAdminClaim } from "../lib/adminAuth";
import Nav from "../components/Nav";

export default function ProfilePage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [collectionCount, setCollectionCount] = useState(0);
  const [cardCount, setCardCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;

    async function load() {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      try {
        const [userSnap, colSnap, itemSnap] = await Promise.all([
          get(ref(db, `users/${uid}`)),
          get(ref(db, `users/${uid}/collections`)),
          get(ref(db, `users/${uid}/collectionItems`)),
        ]);

        if (!alive) return;

        const userVal = userSnap.exists() ? userSnap.val() : {};
        setUsername(userVal.username || auth.currentUser?.displayName || "Collector");
        setEmail(auth.currentUser?.email || userVal.email || "");
        setIsAdmin(await hasAdminClaim(auth.currentUser));

        const cols = colSnap.exists() ? colSnap.val() : {};
        setCollectionCount(Object.keys(cols).filter((k) => !k.startsWith("_")).length);

        const items = itemSnap.exists() ? itemSnap.val() : {};
        setCardCount(Object.keys(items).filter((k) => !k.startsWith("_")).length);
      } catch (err) {
        setError(err?.message || "Could not load profile.");
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  async function handleLogout() {
    try {
      await signOut(auth);
      navigate("/");
    } catch (err) {
      setError(err?.message || "Could not log out.");
    }
  }

  return (
    <main className="page-content with-nav-space">
      <section className="section-block profile-card">
        <h1>{username || "Collector"}</h1>
        <p className="muted">{email || "No email"}</p>

        <div className="stats-grid">
          <article className="stat-card">
            <p className="stat-label">Collections</p>
            <p className="stat-value">{collectionCount}</p>
          </article>
          <article className="stat-card">
            <p className="stat-label">Photocards</p>
            <p className="stat-value">{cardCount}</p>
          </article>
        </div>

        {error && <p className="error-text">{error}</p>}

        {isAdmin ? (
          <Link to="/admin" className="btn btn-primary">
            Open admin panel
          </Link>
        ) : null}

        <div className="profile-actions">
          <button className="btn btn-ghost" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </section>

      <Nav />
    </main>
  );
}
