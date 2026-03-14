import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { createUserWithEmailAndPassword, updateProfile, deleteUser } from "firebase/auth";
import { ref, runTransaction, serverTimestamp, update } from "firebase/database";
import { auth, db } from "../../firebase-config";

export default function Signup() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const sanitizeUsername = (raw) =>
    raw
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 20);

  function validate() {
    const u = sanitizeUsername(username);
    if (!u || u.length < 3) {
      return "Choose a username with at least 3 characters (a-z, 0-9 or _).";
    }
    if (!email.trim()) return "Please enter a valid email.";
    if (pw.length < 6) return "Password must be at least 6 characters.";
    return null;
  }

  async function reserveUsernameTx(usernameNorm, uid) {
    const unameRef = ref(db, `userIndex/usernames/${usernameNorm}`);
    const res = await runTransaction(unameRef, (current) => {
      if (current === null) return uid;
      return;
    });
    return res.committed && res.snapshot.val() === uid;
  }

  async function createUserDoc(uid, { username: uname, email: userEmail }) {
    const now = serverTimestamp();

    await update(ref(db), {
      [`users/${uid}/uid`]: uid,
      [`users/${uid}/username`]: uname,
      [`users/${uid}/email`]: userEmail,
      [`users/${uid}/bio`]: "",
      [`users/${uid}/profilePhotoUrl`]: "",
      [`users/${uid}/profilePhotoPath`]: "",
      [`users/${uid}/settings/language`]: "en",
      [`users/${uid}/settings/theme`]: "system",
      [`users/${uid}/settings/privacy`]: "friends",
      [`users/${uid}/createdAt`]: now,
      [`users/${uid}/updatedAt`]: now,

      [`users/${uid}/collections/_placeholder`]: true,
      [`users/${uid}/ownedItems/_placeholder`]: true,
      [`users/${uid}/favourites/_placeholder`]: true,
      [`users/${uid}/wishlist/_placeholder`]: true,
      [`users/${uid}/friends/_placeholder`]: true,
      [`users/${uid}/friendRequestsIncoming/_placeholder`]: true,
      [`users/${uid}/friendRequestsOutgoing/_placeholder`]: true,

      [`userIndex/usernames/${uname}`]: uid,
    });
  }

  async function handleSignup(e) {
    e.preventDefault();
    setError("");

    const v = validate();
    if (v) return setError(v);

    const usernameNorm = sanitizeUsername(username);
    setLoading(true);

    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);
      const uid = cred.user.uid;

      const ok = await reserveUsernameTx(usernameNorm, uid);
      if (!ok) {
        try {
          await deleteUser(auth.currentUser);
        } catch (delErr) {
          console.error("Cleanup failed:", delErr);
        }
        throw { code: "username-already-in-use" };
      }

      try {
        await updateProfile(auth.currentUser, { displayName: usernameNorm });
      } catch (updErr) {
        console.warn("Could not update displayName:", updErr);
      }

      await createUserDoc(uid, { username: usernameNorm, email: email.trim() });
      navigate("/homepage");
    } catch (err) {
      setError(mapFirebaseError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="login-title">Sign up</h2>
      <p className="login-subtitle">
        Already have an account? <Link to="/login">Login</Link>
      </p>

      <form className="login-form" onSubmit={handleSignup} noValidate>
        <div className="login-inputs">
          <p>Username</p>
          <input
            type="text"
            placeholder="Enter a username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            pattern="^[a-z0-9_]{3,20}$"
            required
          />

          <p>Email</p>
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
            placeholder="At least 6 characters"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
          />
        </div>

        {error && <p className="login-error">{error}</p>}

        <button className="btn btn-primary create-btn" type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create account"}
        </button>
      </form>
    </div>
  );
}

function mapFirebaseError(error) {
  const code = String(error?.code || "");
  if (code.includes("username-already-in-use")) {
    return "That username is taken. Please try another.";
  }
  if (code.includes("auth/email-already-in-use")) return "This email is already in use.";
  if (code.includes("auth/invalid-email")) return "Invalid email address.";
  if (code.includes("auth/weak-password")) return "Your password is too weak.";
  return "Something went wrong. Please try again.";
}
