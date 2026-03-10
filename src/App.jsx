import { Routes, Route, Navigate } from "react-router";
import Header from "./components/Header";
import LandingPage from "./pages/LandingPage";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import CreateCollection from "./pages/CreateCollection";
import AfterSignUp from "./pages/AfterSignUp";
import CollectionPage from "./pages/CollectionPage";
import AddItem from "./pages/AddItem";
import SubmitPage from "./pages/SubmitPage";
import SubmitSuccess from "./pages/SubmitSuccess";
import { useEffect, useState } from "react";
import { auth } from "../firebase-config";
import { onAuthStateChanged } from "firebase/auth";
import AddCategory from "./pages/CreateCategory";
import ScrollToTop from "./pages/ScrollToTop";
import CategoryPage from "./pages/CategoryPage";
import AddItemsToCategoryPage from "./pages/AddItemsToCategoryPage";
import Favourites from "./pages/Favourites";
import ProfilePage from "./pages/ProfilePage";
import AllCollectionsPage from "./pages/AllCollectionsPage";
import HomePage from "./pages/HomePage";
import DetailPage from "./pages/DetailPage";
import WishlistPage from "./pages/WishlistPage";
import AuthorPage from "./pages/AuthorPage";
import AdminPendingItems from "./pages/AdminPendingItems";
import EditCollectionPage from "./pages/EditCollectionPage";
import AccountSettings from "./pages/AccountSettings";
import EditCategoryPage from "./pages/EditCategoryPage";
import RemoveItemsFromCategoryPage from "./pages/RemoveItemsFromCategoryPage";

export default function App() {
  // parse stored value safely to boolean; default false
  const stored = localStorage.getItem("isAuth");
  const initialAuth = stored === "true";
  const [isAuth, setIsAuth] = useState(initialAuth);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAuth(true);
        localStorage.setItem("isAuth", "true");
      } else {
        setIsAuth(false);
        localStorage.removeItem("isAuth");
      }
      setAuthReady(true);
    });

    return () => unsub();
  }, []);

  if (!authReady) {
    return (
      <>
        <Header />
        <main>
          <ScrollToTop />
          <div style={{ padding: 40, textAlign: "center" }}>Loading…</div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main>
        <ScrollToTop />
        {isAuth ? (
          <Routes>
            <Route path="/homepage" element={<HomePage />} />
            <Route path="/createcollection" element={<CreateCollection />} />
            <Route path="/after-signup" element={<AfterSignUp />} />
            <Route
              path="/users/:uid/collections/:collectionId"
              element={<CollectionPage />}
            />
            <Route
              path="/users/:uid/collections/:collectionId/createcategory"
              element={<AddCategory />}
            />
            <Route
              path="/users/:uid/collections/:collectionId/categories/:categoryId"
              element={<CategoryPage />}
            />
            <Route
              path="/users/:uid/collections/:collectionId/categories/:categoryId/add-items"
              element={<AddItemsToCategoryPage />}
            />
            <Route path="/additem" element={<AddItem />} />
            <Route path="/submit" element={<SubmitPage />} />
            <Route path="/submitsuccess" element={<SubmitSuccess />} />
            <Route path="/admin" element={<AdminPendingItems />} />
            <Route path="/favourites" element={<Favourites />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/allcollections" element={<AllCollectionsPage />} />
            <Route path="/items/:id" element={<DetailPage />} />
            <Route
              path="/users/:uid/collections/:collectionId/items/:id"
              element={<DetailPage />}
            />
            <Route path="/wishlist" element={<WishlistPage />} />
            <Route path="/authors/:authorKey" element={<AuthorPage />} />
            <Route path="*" element={<Navigate to="/homepage" replace />} />
            <Route path="/account-settings" element={<AccountSettings />} />
            <Route
              path="/users/:uid/collections/:collectionId/edit"
              element={<EditCollectionPage />}
            />
            <Route
              path="/users/:uid/collections/:collectionId/categories/:categoryId/edit"
              element={<EditCategoryPage />}
            />
            <Route
              path="/users/:uid/collections/:collectionId/categories/:categoryId/remove-items"
              element={<RemoveItemsFromCategoryPage />}
            />
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
