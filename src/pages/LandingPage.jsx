import { Link } from "react-router";

export default function LandingPage() {
  return (
    <section className="hero">
      <p className="hero-kicker">K-pop Photocard Tracker</p>
      <h1>Track every photocard from your albums in one place.</h1>
      <p className="hero-copy">
        Build personal collections, upload card photos, and keep your pull history
        organized on both mobile and desktop.
      </p>
      <div className="hero-actions">
        <Link to="/signup" className="btn btn-primary">
          Create account
        </Link>
        <Link to="/login" className="btn btn-ghost">
          Log in
        </Link>
      </div>
    </section>
  );
}
