import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { signOut, updateProfile } from "firebase/auth";
import { ref, get, update, runTransaction, serverTimestamp } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../../firebase-config";
import { hasAdminClaim } from "../lib/adminAuth";
import { buildProfileAvatarImagePath, normalizeImageExtension } from "../lib/imagePaths";
import StorageImage from "../components/StorageImage";
import Nav from "../components/Nav";

function sanitizeUsername(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
}

function mapFriendList(value) {
  return Object.entries(value || {})
    .filter(([key]) => !String(key).startsWith("_"))
    .map(([uid, payload]) => ({
      uid,
      username: String(payload?.username || uid),
      since: payload?.since || 0,
    }))
    .sort((a, b) => a.username.localeCompare(b.username));
}

function mapIncomingRequests(value) {
  return Object.entries(value || {})
    .filter(([key]) => !String(key).startsWith("_"))
    .map(([fromUid, payload]) => ({
      fromUid,
      fromUsername: String(payload?.fromUsername || fromUid),
      createdAt: payload?.createdAt || 0,
    }))
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

export default function ProfilePage() {
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [email, setEmail] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [collectionCount, setCollectionCount] = useState(0);
  const [cardCount, setCardCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [friendUsernameInput, setFriendUsernameInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const navigate = useNavigate();
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview("");
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const loadProfile = useCallback(async () => {
    if (!uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [userSnap, colSnap, itemSnap] = await Promise.all([
        get(ref(db, `users/${uid}`)),
        get(ref(db, `users/${uid}/collections`)),
        get(ref(db, `users/${uid}/ownedItems`)),
      ]);

      const userVal = userSnap.exists() ? userSnap.val() : {};
      setUsername(String(userVal.username || auth.currentUser?.displayName || "collector"));
      setBio(String(userVal.bio || ""));
      setPhotoUrl(String(userVal.profilePhotoUrl || ""));
      setEmail(auth.currentUser?.email || String(userVal.email || ""));

      const cols = colSnap.exists() ? colSnap.val() : {};
      setCollectionCount(Object.keys(cols).filter((k) => !k.startsWith("_")).length);

      const items = itemSnap.exists() ? itemSnap.val() : {};
      const ownedCount = Object.keys(items).filter((k) => !k.startsWith("_")).length;
      setCardCount(ownedCount);

      setFriends(mapFriendList(userVal.friends || {}));
      setIncomingRequests(mapIncomingRequests(userVal.friendRequestsIncoming || {}));
      setOutgoingRequests(
        Object.entries(userVal.friendRequestsOutgoing || {})
          .filter(([key]) => !String(key).startsWith("_"))
          .map(([toUid, payload]) => ({
            toUid,
            toUsername: String(payload?.toUsername || toUid),
          }))
      );

      setIsAdmin(await hasAdminClaim(auth.currentUser));
    } catch (err) {
      setError(err?.message || "Could not load profile.");
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  async function handleSaveProfile() {
    if (!uid) return;
    setError("");
    setSuccess("");

    const nextUsername = sanitizeUsername(username);
    if (!nextUsername || nextUsername.length < 3) {
      setError("Username must be at least 3 characters (a-z, 0-9, _).");
      return;
    }

    setSavingProfile(true);
    try {
      const userSnap = await get(ref(db, `users/${uid}`));
      const currentVal = userSnap.exists() ? userSnap.val() : {};
      const currentUsername = sanitizeUsername(currentVal.username || auth.currentUser?.displayName || "");

      const updates = {
        [`users/${uid}/username`]: nextUsername,
        [`users/${uid}/bio`]: String(bio || "").trim(),
        [`users/${uid}/updatedAt`]: serverTimestamp(),
      };

      if (nextUsername !== currentUsername) {
        const usernameRef = ref(db, `userIndex/usernames/${nextUsername}`);
        const tx = await runTransaction(usernameRef, (existing) => {
          if (existing === null) return uid;
          if (existing === uid) return uid;
          return;
        });
        if (!tx.committed || tx.snapshot.val() !== uid) {
          throw new Error("That username is already in use.");
        }
        if (currentUsername) {
          updates[`userIndex/usernames/${currentUsername}`] = null;
        }
        try {
          await updateProfile(auth.currentUser, { displayName: nextUsername });
        } catch {
          // Ignore displayName sync failures.
        }
      }

      if (photoFile) {
        const ext = normalizeImageExtension(photoFile.name.split(".").pop(), "jpg");
        const photoPath = buildProfileAvatarImagePath(uid, ext);
        const fileRef = storageRef(storage, photoPath);
        await uploadBytes(fileRef, photoFile, { contentType: photoFile.type || "image/jpeg" });
        const url = await getDownloadURL(fileRef);
        updates[`users/${uid}/profilePhotoPath`] = photoPath;
        updates[`users/${uid}/profilePhotoUrl`] = url;
        setPhotoUrl(url);
        setPhotoFile(null);
      }

      await update(ref(db), updates);
      setUsername(nextUsername);
      setSuccess("Profile saved.");
    } catch (err) {
      setError(err?.message || "Could not save profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSendFriendRequest() {
    if (!uid) return;
    setError("");
    setSuccess("");

    const targetUsername = sanitizeUsername(friendUsernameInput);
    if (!targetUsername) {
      setError("Enter a valid username.");
      return;
    }

    setSendingRequest(true);
    try {
      const targetUidSnap = await get(ref(db, `userIndex/usernames/${targetUsername}`));
      if (!targetUidSnap.exists()) throw new Error("User not found.");
      const targetUid = String(targetUidSnap.val() || "");
      if (!targetUid || targetUid === uid) throw new Error("You cannot add yourself.");

      const [friendSnap, incomingSnap, outgoingSnap] = await Promise.all([
        get(ref(db, `users/${uid}/friends/${targetUid}`)),
        get(ref(db, `users/${uid}/friendRequestsIncoming/${targetUid}`)),
        get(ref(db, `users/${uid}/friendRequestsOutgoing/${targetUid}`)),
      ]);
      if (friendSnap.exists()) throw new Error("You are already friends.");
      if (incomingSnap.exists()) throw new Error("This user already sent you a request.");
      if (outgoingSnap.exists()) throw new Error("Friend request already sent.");

      const myUsername = sanitizeUsername(username) || "collector";
      const now = serverTimestamp();
      await update(ref(db), {
        [`users/${uid}/friendRequestsOutgoing/${targetUid}`]: {
          toUid: targetUid,
          toUsername: targetUsername,
          createdAt: now,
          status: "pending",
        },
        [`users/${targetUid}/friendRequestsIncoming/${uid}`]: {
          fromUid: uid,
          fromUsername: myUsername,
          createdAt: now,
          status: "pending",
        },
      });
      setFriendUsernameInput("");
      setSuccess("Friend request sent.");
      await loadProfile();
    } catch (err) {
      setError(err?.message || "Could not send friend request.");
    } finally {
      setSendingRequest(false);
    }
  }

  async function handleAcceptFriendRequest(req) {
    if (!uid || !req?.fromUid) return;
    setError("");
    setSuccess("");
    try {
      const myUsername = sanitizeUsername(username) || "collector";
      const friendUid = req.fromUid;
      const friendUsername = sanitizeUsername(req.fromUsername) || friendUid;
      const now = serverTimestamp();

      await update(ref(db), {
        [`users/${uid}/friends/${friendUid}`]: {
          uid: friendUid,
          username: friendUsername,
          since: now,
        },
        [`users/${friendUid}/friends/${uid}`]: {
          uid,
          username: myUsername,
          since: now,
        },
        [`users/${uid}/friendRequestsIncoming/${friendUid}`]: null,
        [`users/${friendUid}/friendRequestsOutgoing/${uid}`]: null,
      });
      setSuccess(`You are now friends with ${friendUsername}.`);
      await loadProfile();
    } catch (err) {
      setError(err?.message || "Could not accept request.");
    }
  }

  async function handleDeclineFriendRequest(req) {
    if (!uid || !req?.fromUid) return;
    setError("");
    setSuccess("");
    try {
      await update(ref(db), {
        [`users/${uid}/friendRequestsIncoming/${req.fromUid}`]: null,
        [`users/${req.fromUid}/friendRequestsOutgoing/${uid}`]: null,
      });
      await loadProfile();
    } catch (err) {
      setError(err?.message || "Could not decline request.");
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth);
      navigate("/");
    } catch (err) {
      setError(err?.message || "Could not log out.");
    }
  }

  if (loading) {
    return (
      <main className="page-content with-nav-space">
        <section className="section-block">
          <p className="muted">Loading profile...</p>
        </section>
        <Nav />
      </main>
    );
  }

  return (
    <main className="page-content with-nav-space">
      <section className="section-block profile-card">
        <div className="profile-head">
          <StorageImage
            src={photoPreview || photoUrl}
            alt={username || "Profile"}
            className="profile-avatar"
          />
          <div>
            <h1>{username || "Collector"}</h1>
            <p className="muted">{email || "No email"}</p>
            <Link to={`/users/${uid}/public`} className="btn btn-ghost small">
              View public profile
            </Link>
          </div>
        </div>

        <div className="stats-grid">
          <article className="stat-card">
            <p className="stat-label">Collections</p>
            <p className="stat-value">{collectionCount}</p>
          </article>
          <article className="stat-card">
            <p className="stat-label">Photocards</p>
            <p className="stat-value">{cardCount}</p>
          </article>
          <article className="stat-card">
            <p className="stat-label">Friends</p>
            <p className="stat-value">{friends.length}</p>
          </article>
        </div>

        <div className="form-grid compact">
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label>
            Bio
            <input value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell people what you collect" />
          </label>
          <label>
            Profile picture
            <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
          </label>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
        {success ? <p className="success-text">{success}</p> : null}

        <div className="profile-actions">
          <button className="btn btn-primary" type="button" onClick={handleSaveProfile} disabled={savingProfile}>
            {savingProfile ? "Saving..." : "Save profile"}
          </button>
          {isAdmin ? (
            <Link to="/admin" className="btn btn-ghost">
              Open admin panel
            </Link>
          ) : null}
          <button className="btn btn-ghost" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </section>

      <section className="section-block">
        <h2>Add friend</h2>
        <div className="form-grid compact">
          <label>
            Username
            <input
              value={friendUsernameInput}
              onChange={(e) => setFriendUsernameInput(e.target.value)}
              placeholder="friend_username"
            />
          </label>
          <div className="center-action">
            <button className="btn btn-primary small" type="button" onClick={handleSendFriendRequest} disabled={sendingRequest}>
              {sendingRequest ? "Sending..." : "Send request"}
            </button>
          </div>
        </div>
      </section>

      <section className="section-block">
        <h2>Friend requests</h2>
        {incomingRequests.length === 0 ? (
          <p className="muted">No incoming requests.</p>
        ) : (
          <ul className="member-list">
            {incomingRequests.map((req) => (
              <li key={req.fromUid}>
                <span>{req.fromUsername}</span>
                <div className="center-action">
                  <button className="btn btn-primary small" type="button" onClick={() => handleAcceptFriendRequest(req)}>
                    Accept
                  </button>
                  <button className="btn btn-ghost small" type="button" onClick={() => handleDeclineFriendRequest(req)}>
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {outgoingRequests.length > 0 ? (
          <p className="muted">Pending: {outgoingRequests.map((r) => r.toUsername).join(", ")}</p>
        ) : null}
      </section>

      <section className="section-block">
        <h2>Friends</h2>
        {friends.length === 0 ? (
          <p className="muted">No friends yet.</p>
        ) : (
          <ul className="member-list">
            {friends.map((friend) => (
              <li key={friend.uid}>
                <span>{friend.username}</span>
                <Link to={`/users/${friend.uid}/public`} className="btn btn-ghost small">
                  View profile
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Nav />
    </main>
  );
}
