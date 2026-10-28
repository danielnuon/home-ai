/**
 * @file The page for an address Brain doesn't have, with the way back (spec 7.16, rule 9).
 */
import { Link } from "react-router-dom";
import { Page } from "../components/Page";

/** Not found. */
export default function NotFound() {
  return (
    <Page title="Not here">
      <p className="card empty">
        That page doesn't exist. <Link to="/">Back to Today</Link>
      </p>
    </Page>
  );
}
