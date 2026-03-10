import { Link } from "react-router";
import Nav from "../components/Nav";

export default function SubmitSuccess() {
  return (
    <main>
      <h1 className="page-title">
        The item has been <span className="gradient-text">submitted!</span>
      </h1>
      <p className="aftersignup-subtitle submitted-subtitle">
        We will notify you when your item has been approved and added to your
        collection.
      </p>
      <div className="submitted-btns-container">
        <Link
          to="/users/:uid/collections/:collectionId"
          className="login-btn submitted-btns"
          aria-label="Login"
        >
          Go to your collections
        </Link>
        <Link
          to="/additem"
          className="get-started-btn submitted-btns"
          aria-label="Login"
        >
          Add another item
        </Link>
      </div>
      <Nav />
    </main>
  );
}
