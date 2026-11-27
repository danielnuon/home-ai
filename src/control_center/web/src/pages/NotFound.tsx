/**
 * @file The page for an address Brain doesn't have, with the way back (spec 7.16, rule 9).
 */
import { Link } from "react-router-dom";
import { Page } from "../components/Page";

/** Not found. */
export default function NotFound() {
  return (
    <Page title="Not here">
      <div className="card empty stack" style={{ justifyItems: "center" }}>
        <p>That page doesn't exist.</p>
        <Link to="/" className="btn primary">
          Back to Today
        </Link>
      </div>
    </Page>
  );
}
