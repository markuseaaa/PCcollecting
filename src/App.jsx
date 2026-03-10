import { Routes, Route, Navigate } from "react-router";
import { useEffect, useState } from "react";
import { auth } from "../firebase-config";
import { onAuthStateChanged } from "firebase/auth";
import Header from "./components/Header";
import ScrollToTop from "./pages/ScrollToTop";
import LandingPage from "./pages/LandingPage";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import HomePage from "./pages/HomePage";
import AllCollectionsPage from "./pages/AllCollectionsPage";
import CreateCollection from "./pages/CreateCollection";
import EditCollectionPage from "./pages/EditCollectionPage";
import CollectionPage from "./pages/CollectionPage";
import AddItem from "./pages/AddItem";
import SubmitPage from "./pages/SubmitPage";
import DetailPage from "./pages/DetailPage";
import ProfilePage from "./pages/ProfilePage";
import MyPhotocardsPage from "./pages/MyPhotocardsPage";
import AdminPage from "./pages/AdminPage";
import ScanPage from "./pages/ScanPage";

export default function App() {
  const stored = localStorage.getItem("isAuth");
  const [isAuth, setIsAuth] = useState(stored === "true");
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let resolved = false;
    const readyTimeout = setTimeout(() => {
      if (resolved) return;
      setIsAuth(false);
      setAuthReady(true);
    }, 3500);

    const unsub = onAuthStateChanged(auth, (user) => {
      resolved = true;
      clearTimeout(readyTimeout);
      if (user) {
        setIsAuth(true);
        localStorage.setItem("isAuth", "true");
      } else {
        setIsAuth(false);
        localStorage.removeItem("isAuth");
      }
      setAuthReady(true);
    });

    return () => {
      clearTimeout(readyTimeout);
      unsub();
    };
  }, []);

  if (!authReady) {
    return (
      <>
        <Header />
        <main className="app-shell">
          <div className="status-card">Loading your photocard vault...</div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="app-shell">
        <ScrollToTop />
        {isAuth ? (
          <Routes>
            <Route path="/homepage" element={<HomePage />} />
            <Route path="/allcollections" element={<AllCollectionsPage />} />
            <Route path="/createcollection" element={<CreateCollection />} />
            <Route
              path="/users/:uid/collections/:collectionId/edit"
              element={<EditCollectionPage />}
            />
            <Route
              path="/users/:uid/collections/:collectionId"
              element={<CollectionPage />}
            />
            <Route path="/additem" element={<AddItem />} />
            <Route path="/scan" element={<ScanPage />} />
            <Route path="/my-photocards" element={<MyPhotocardsPage />} />
            <Route path="/submit" element={<SubmitPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route
              path="/users/:uid/collections/:collectionId/items/:id"
              element={<DetailPage />}
            />
            <Route path="/items/:id" element={<DetailPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/homepage" replace />} />
          </Routes>
        ) : (
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
    </>
  );
}
