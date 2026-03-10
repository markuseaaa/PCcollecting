import { useState } from "react";
import { useNavigate, Link } from "react-router";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
} from "firebase/auth";
import { auth, googleProvider } from "../../firebase-config";
import Google from "../assets/icons/google.svg";

export default function LogInd() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pw);
      // Efter login -> HomePage
      navigate("/homepage", { replace: true });
    } catch (err) {
      setError(mapFirebaseError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError("");
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      navigate("/", { replace: true });
    } catch (err) {
      setError(mapFirebaseError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e) {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Please enter your email to reset your password.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setError("Password reset email sent.");
    } catch (err) {
      setError(mapFirebaseError(err));
    }
  }

  return (
    <div>
      <h2 className="login-title">Login</h2>
      <p className="login-subtitle">
        Don&lsquo;t have an account? <Link to="/signup">Sign up</Link>
      </p>
      <form className="login-form" onSubmit={handleLogin} noValidate>
        <div className="login-inputs">
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
          <p>
            Password <span className="gradient-text">*</span>
          </p>
          <input
            type="password"
            placeholder="Enter your password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
          />
        </div>

        <a href="#" onClick={handleForgot} className="forgot-link">
          Forgot password?
        </a>

        {error && <p className="login-error">{error}</p>}

        <button className="get-started-btn" type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Log in"}
        </button>

        <button
          type="button"
          className="login-btn"
          onClick={handleGoogle}
          disabled={loading}
        >
          Log ind med Google
          <img src={Google} alt="Google ikon" className="google-icon" />
        </button>
      </form>
    </div>
  );
}

function mapFirebaseError(error) {
  const code = error?.code || "";
  if (code.includes("invalid-email")) return "Invalid email format.";
  if (code.includes("user-not-found")) return "User not found.";
  if (code.includes("wrong-password")) return "Wrong password.";
  if (code.includes("too-many-requests"))
    return "Too many unsuccessful login attempts. Please try again later.";
  if (code.includes("popup-closed-by-user")) return "Login cancelled.";
  return "Something went wrong. Please try again.";
}
