import { useEffect, useState } from "react";
import { Link } from "react-router";
import { auth, db } from "../../firebase-config";
import { ref, get, child } from "firebase/database";
import PlusIcon from "../assets/icons/plus.svg";

export default function LandingPage() {
  const [username, setUsername] = useState("");

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
        if (snap.exists()) {
          setUsername(snap.val());
        }
      } catch (err) {
        console.error("Could not load username:", err);
      }
    }

    fetchUsername();
  }, []);

  return (
    <main className="landing-container">
      <div className="landing-text">
        <h1 className="page-title">
          Welcome <span className="gradient-text">{username || "..."}</span>!
        </h1>
        <h3 className="aftersignup-subtitle">
          Get started collecting and organising your collections today!
        </h3>
      </div>

      <div className="aftersignup-btn-wrapper">
        <Link
          to="/createcollection"
          className="plus-button"
          aria-label="Create Collection"
        >
          <img src={PlusIcon} alt="Add collection" className="plus-icon" />
        </Link>
      </div>
    </main>
  );
}
