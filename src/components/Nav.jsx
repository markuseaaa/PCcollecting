// Nav.jsx
import { NavLink, useLocation, useNavigate } from "react-router";
import { useEffect, useState, useCallback } from "react";

import addItem from "../assets/icons/additem.svg";
import addItemOpen from "../assets/icons/additemopen.svg";
import collections from "../assets/icons/collections.svg";
import favourites from "../assets/icons/favourites.svg";
import home from "../assets/icons/home.svg";
import profile from "../assets/icons/profile.svg";

export default function Nav() {
  const [addOpen, setAddOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const links = [
    { to: "/homepage", icon: home, label: "Hjem" },
    { to: "/allcollections", icon: collections, label: "Samlinger" },
    { to: "/add", icon: addItem, label: "Tilføj", isAdd: true },
    { to: "/favourites", icon: favourites, label: "Favoritter" },
    { to: "/profile", icon: profile, label: "Profil" },
  ];

  // luk hvis rute skifter
  useEffect(() => setAddOpen(false), [pathname]);

  // ESC lukker
  useEffect(() => {
    if (!addOpen) return;
    const onKey = (e) => e.key === "Escape" && setAddOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addOpen]);

  const toggleAdd = useCallback((e) => {
    e.preventDefault(); // undgå navigation til /add
    setAddOpen((v) => !v);
  }, []);

  // Brug navigate når admin vælger at oprette collection
  const onAddCollection = useCallback(() => {
    // naviger til den side hvor I opretter samlinger
    navigate("/createcollection");
    setAddOpen(false);
  }, [navigate]);

  // Brug navigate når admin vælger at tilføje item
  const onAddItem = useCallback(() => {
    // naviger til den side hvor I opretter items
    navigate("/additem");
    setAddOpen(false);
  }, [navigate]);

  return (
    <>
      {/* klik-udenfor for at lukke */}
      {addOpen && (
        <button
          className="add-backdrop"
          aria-label="Luk tilføj-menuen"
          onClick={() => setAddOpen(false)}
        />
      )}

      {/* GRADIENT-POPUP: bag navbaren og starter halvvejs under den */}
      {addOpen && (
        <div
          className="add-popup"
          role="dialog"
          aria-modal="true"
          id="add-popup"
        >
          <button className="add-choice" onClick={onAddCollection}>
            Add collection
          </button>
          <span className="add-divider" aria-hidden="true" />
          <button className="add-choice" onClick={onAddItem}>
            Add item
          </button>
        </div>
      )}

      <nav className={`nav-bar ${addOpen ? "is-open" : ""}`}>
        {links.map((link, idx) => {
          const isAdd = !!link.isAdd;

          // skjul andre ikoner fuldstændigt, men bevar kolonne med placeholder så grid’et står fast
          if (addOpen && !isAdd) {
            return (
              <div
                key={link.to || idx}
                className="nav-placeholder"
                aria-hidden="true"
              />
            );
          }

          const imgSrc = isAdd && addOpen ? addItemOpen : link.icon;

          if (isAdd) {
            // brug <button> for at undgå faktisk navigation — vi styrer navigation fra popup-knapperne
            return (
              <button
                key="add"
                type="button"
                className="nav-link is-add"
                onClick={toggleAdd}
                aria-expanded={addOpen}
                aria-controls="add-popup"
              >
                <div className="icon-wrapper is-add">
                  <img
                    src={imgSrc}
                    alt={link.label}
                    className="icon-image icon-add"
                  />
                </div>
              </button>
            );
          }

          // Almindelige navlinks (brug NavLink så active class fungerer)
          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `nav-link ${isActive ? "active" : ""}`
              }
            >
              <div className="icon-wrapper">
                <img src={link.icon} alt={link.label} className="icon-image" />
              </div>
            </NavLink>
          );
        })}
      </nav>
    </>
  );
}
