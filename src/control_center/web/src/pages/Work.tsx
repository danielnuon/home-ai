/**
 * @file Work: development items moving through their pipeline, ideas, and reviews (design: Work).
 */
import { useWorkBoard } from "../api/queries";
import type { WorkItem } from "../api/types";
import { Avatar } from "../components/Avatar";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { StageRail } from "../components/StageRail";
import { StatusText } from "../design/status";

/** One work item: who has it, where it is, and what it costs so far. */
function WorkCard({ item }: { item: WorkItem }) {
  return (
    <article
      className={`card stack ${item.waiting_on_owner ? "attention" : ""}`}
      aria-label={item.title}
    >
      <div className="row">
        <Avatar
          department={item.department}
          state={item.employee_state}
          name={item.employee_name}
          size={32}
        />
        <div className="grow">
          <h3>{item.title}</h3>
          <p className="muted small">
            <span className="mono">{item.id}</span> · {item.employee_name} · {item.now}
          </p>
        </div>
        <span className="tag">{item.risk}</span>
      </div>
      <StageRail stages={item.stages} />
      <div
        className="progress"
        role="progressbar"
        aria-label="Progress"
        aria-valuenow={Math.round(item.progress * 100)}
      >
        <span style={{ transform: `scaleX(${item.progress})` }} />
      </div>
      <div className="row small">
        <StatusText value={item.status} className="grow" />
        <span className="muted">
          {item.eta} · ${item.cost_usd.toFixed(2)}
        </span>
      </div>
    </article>
  );
}

/** The Work page. */
export default function Work() {
  const query = useWorkBoard();
  return (
    <Page title="Work" subtitle="What the team is building, and where each piece is.">
      <QueryState query={query}>
        {(board) => (
          <>
            <Section title="In progress" aside={`${board.items.length} items`}>
              <div className="card-grid">
                {board.items.map((item) => (
                  <WorkCard key={item.id} item={item} />
                ))}
              </div>
            </Section>
            <Section title="Reviews">
              <ul className="list">
                {board.reviews.map((review) => (
                  <li key={review.id} className="list-row">
                    <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
                      <span className="row-title">{review.title}</span>
                      <span className="muted small">
                        {review.reviewer} · readability {review.readability}
                      </span>
                    </span>
                    <span className="mono small">
                      <span className="status-healthy">+{review.added_lines}</span>{" "}
                      <span className="status-problem">−{review.removed_lines}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Ideas">
              <ul className="list">
                {board.ideas.map((idea) => (
                  <li key={idea.id} className="list-row">
                    <span className="grow row-title">{idea.title}</span>
                    <span className="muted small">
                      {idea.lead} · {idea.state}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          </>
        )}
      </QueryState>
    </Page>
  );
}
