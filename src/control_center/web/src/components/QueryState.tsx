/**
 * @file Loading and error states for a page's data (spec 7.16, rule 9: no dead ends).
 *
 * A page passes its query and a render function; while loading it shows a quiet placeholder, on
 * failure it says what went wrong and offers Try again, and otherwise renders the data.
 */
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ApiError } from "../api/client";

interface QueryStateProps<Data> {
  query: UseQueryResult<Data>;
  children: (data: Data) => ReactNode;
}

/** Renders `children(data)` once the query has data. */
export function QueryState<Data>({ query, children }: QueryStateProps<Data>) {
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.isError) {
    const reason = query.error instanceof ApiError ? query.error.reason : "Brain didn't answer.";
    return (
      <div className="card stack" role="alert">
        <p className="status-problem">■ {reason}</p>
        <button type="button" className="btn" onClick={() => void query.refetch()}>
          Try again
        </button>
      </div>
    );
  }
  return (
    <div className="loading" aria-busy="true">
      <span className="visually-hidden">Loading</span>
      <div className="placeholder" />
      <div className="placeholder" />
    </div>
  );
}
