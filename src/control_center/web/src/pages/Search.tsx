/**
 * @file Search: results across Brain, with Wayfinder's short answer on top (design: Search).
 */
import { Link, useSearchParams } from "react-router-dom";
import { useSearch } from "../api/queries";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";

/** The Search page. The query comes from the address, so results can be shared and revisited. */
export default function Search() {
  const [params] = useSearchParams();
  const text = params.get("q") ?? "";
  const query = useSearch(text);
  if (!text.trim()) {
    return (
      <Page title="Search">
        <p className="card empty">
          Type in the search field to look across people, work, settings and docs.
        </p>
      </Page>
    );
  }
  return (
    <Page title="Search" subtitle={`Results for “${text}”`}>
      <QueryState query={query}>
        {(results) => (
          <>
            {results.answer && <p className="card">{results.answer}</p>}
            {results.sections.length === 0 && (
              <p className="card empty">Nothing matched. Try fewer words, or ask in Chat.</p>
            )}
            {results.sections.map((section) => (
              <Section key={section.name} title={section.name}>
                <div className="list">
                  {section.results.map((result) => (
                    <Link key={result.id} to={result.href} className="list-row">
                      <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
                        <span className="row-title">{result.title}</span>
                        <span className="muted small">{result.meta}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </Section>
            ))}
          </>
        )}
      </QueryState>
    </Page>
  );
}
