import { NavLink } from "react-router";

export default function Nav() {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      <div className="bottom-nav-side left">
        <NavLink
          to="/homepage"
          className={({ isActive }) => `bottom-nav-link ${isActive ? "active" : ""}`}
        >
          Home
        </NavLink>
        <NavLink
          to="/allcollections"
          className={({ isActive }) => `bottom-nav-link ${isActive ? "active" : ""}`}
        >
          Collections
        </NavLink>
      </div>

      <NavLink
        to="/additem"
        className={({ isActive }) =>
          `bottom-nav-add ${isActive ? "active" : ""}`
        }
      >
        <span className="nav-add-full">Add Photocard</span>
        <span className="nav-add-short">Add</span>
      </NavLink>

      <div className="bottom-nav-side right">
        <NavLink
          to="/my-photocards"
          className={({ isActive }) => `bottom-nav-link ${isActive ? "active" : ""}`}
        >
          My Photocards
        </NavLink>
        <NavLink
          to="/profile"
          className={({ isActive }) => `bottom-nav-link ${isActive ? "active" : ""}`}
        >
          Profile
        </NavLink>
      </div>
    </nav>
  );
}
