import { Link } from "react-router";
import { auth } from "../../firebase-config";

export default function Header() {
  const isAuth = !!auth.currentUser;

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to={isAuth ? "/homepage" : "/"} className="brand-link">
          <span className="brand-mark">K</span>
          <span className="brand-text">Kollectify</span>
        </Link>
      </div>
    </header>
  );
}
