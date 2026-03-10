import { useState } from "react";
import { useNavigate } from "react-router";
import { ref as dbRef, push, set, serverTimestamp } from "firebase/database";
import { auth, db } from "../../firebase-config";
import Nav from "../components/Nav";

const sanitize = (raw) =>
  String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 40);

const validateName = (n) => {
  const s = sanitize(n);
  if (!s || s.length < 2) return "Name must be at least 2 characters.";
  return null;
};
const validateAuthor = (a) => {
  if (!a || String(a).trim().length < 2)
    return "Type in author/artist (at least 2 characters).";
  return null;
};
const validateLink = (u) => {
  try {
    const s = String(u || "").trim();
    if (!s) return "Link can't be empty.";
    const url = new URL(s);
    if (url.protocol !== "https:") return "Link needs to start with https://";
    return null;
  } catch {
    return "Link is not a valid URL.";
  }
};

export default function SubmitPage() {
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  const [type, setType] = useState("book");
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const nameErr = validateName(name);
    if (nameErr) return setError(nameErr);

    const authorErr = validateAuthor(author);
    if (authorErr) return setError(authorErr);

    const linkErr = validateLink(link);
    if (linkErr) return setError(linkErr);

    const user = auth.currentUser;
    if (!user?.uid) return setError("You must be logged in to submit an item.");

    setLoading(true);

    try {
      const uid = user.uid;
      const pendingRef = dbRef(db, "pendingItems");
      const newRef = push(pendingRef);
      const itemId = newRef.key;
      const now = serverTimestamp();

      const itemData = {
        id: itemId,
        title: name.trim(),
        author: author.trim(),
        link: link.trim(),
        type,
        createdBy: uid,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      };

      // Skriv til pendingItems
      await set(newRef, itemData);

      setSuccess("Item is now pending and awaiting approval!");
      setName("");
      setAuthor("");
      setLink("");
      setType("book");

      setTimeout(() => navigate("/submitsuccess"), 900);
    } catch (err) {
      console.error("SubmitItem error:", err);

      if (
        err?.code === "PERMISSION_DENIED" ||
        (err?.message && err.message.toLowerCase().includes("permission"))
      ) {
        setError(
          "Permission denied: your security rules do not allow this action. Check your database rules or log in as the correct user."
        );
      } else {
        setError(
          err?.message || "Something went wrong while submitting the item."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <h1 className="page-title">Submit an item</h1>

      <form onSubmit={handleSubmit} noValidate>
        <div className="collection-btns">
          {["book", "vinyl", "album"].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setType(cat)}
              className={`collection-btn ${type === cat ? "active" : ""}`}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        <div className="login-inputs login-form">
          <label>Navn på item</label>
          <input
            type="text"
            placeholder="Enter name of item"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <label>Author / Artist of item</label>
          <input
            type="text"
            placeholder="Enter author or artist"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            required
          />

          <label className="cover-image-label">Link to item (paste URL)</label>
          <input
            type="url"
            placeholder="https://example.com"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            required
          />
        </div>

        <button
          className="get-started-btn submit-btn"
          type="submit"
          disabled={loading}
        >
          {loading ? "Sending..." : "Submit"}
        </button>

        {error && <div style={{ color: "red", marginTop: 12 }}>{error}</div>}
        {success && (
          <div style={{ color: "green", marginTop: 12 }}>{success}</div>
        )}
      </form>

      <Nav />
    </main>
  );
}
