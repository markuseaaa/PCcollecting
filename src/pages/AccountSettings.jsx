import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router";
import { auth, db } from "../../firebase-config";
import { ref, child, get, update } from "firebase/database";
import { updateEmail, updatePassword } from "firebase/auth";
import Nav from "../components/Nav";
import backArrow from "../assets/icons/backarrow.svg";

export default function AccountSettings() {
  const navigate = useNavigate();
  const mounted = useRef(true);

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    mounted.current = true;

    (async () => {
      try {
        setError("");
        setLoading(true);

        const user = auth.currentUser;
        if (!user) {
          setError("You must be logged in.");
          setLoading(false);
          return;
        }

        const uid = user.uid;
        const snap = await get(child(ref(db), `users/${uid}`));
        const data = snap.exists() ? snap.val() : {};

        if (!mounted.current) return;

        setUsername(data.username || user.displayName || "");
        setEmail(user.email || data.email || "");
        setLoading(false);
      } catch (e) {
        console.error(e);
        if (!mounted.current) return;
        setError("Could not fetch user data.");
        setLoading(false);
      }
    })();

    return () => {
      mounted.current = false;
    };
  }, []);

  async function handleSave(e) {
    e?.preventDefault?.();
    if (processing) return;

    try {
      setProcessing(true);
      setError("");

      const user = auth.currentUser;
      if (!user) throw new Error("Not logged in.");
      const uid = user.uid;

      // 1) Opdater username i Realtime DB
      await update(child(ref(db), `users/${uid}`), {
        username: username.trim(),
      });

      // 2) Opdater email i Auth
      if (email !== user.email) {
        await updateEmail(user, email.trim());
      }

      // 3) Opdater password i Auth (hvis feltet er udfyldt)
      if (password) {
        await updatePassword(user, password);
      }

      alert("Profile updated!");
      navigate(-1);
    } catch (e) {
      console.error(e);
      if (e.code === "auth/requires-recent-login") {
        setError(
          "Because of security reasons, you need to log in again (reauthenticate) before changing email or password."
        );
      } else {
        setError(e.message || "Could not save changes.");
      }
    } finally {
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
        <h1 className="page-title">Account Settings</h1>
      </div>

      <form className="login-form" onSubmit={handleSave} noValidate>
        <div className="login-inputs">
          <p>
            Username <span className="gradient-text">*</span>
          </p>
          <input
            type="text"
            placeholder="Enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />

          <p>
            Email <span className="gradient-text">*</span>
          </p>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <p>Password</p>
          <input
            type="password"
            placeholder="Enter new password (leave blank to keep current)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="login-error">{error}</p>}

        <div>
          <button
            className="get-started-btn save-settings-btn"
            type="submit"
            disabled={processing}
          >
            {processing ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      <Nav />
    </main>
  );
}
