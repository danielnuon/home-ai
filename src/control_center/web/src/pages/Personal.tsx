/**
 * @file Personal: the household's open cases, the domains they belong to, and what Brain changed
 * on its own (design: Personal).
 */
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { usePersonal } from "../api/queries";
import type { Case, PersonalOverview } from "../api/types";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { StatusText } from "../design/status";

const PRINCIPAL_NAMES: Record<Case["principal"], string> = { owner: "You", mom: "Mom", dad: "Dad" };

/** One case with Done and Snooze, or Reopen once it is closed. */
function CaseRow({ item }: { item: Case }) {
  const act = useAction<Case>({
    refresh: ["personal", "today"],
    done: (result) => `${result.title}: ${result.state}`,
  });
  const run = (action: "done" | "snooze" | "reopen") =>
    act.run(() => send("POST", `/cases/${item.id}/action`, { action }));
  return (
    <div className="list-row">
      <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
        <span className="row-title">{item.title}</span>
        <span className="muted small">
          {PRINCIPAL_NAMES[item.principal]} · {item.domain} · {item.employee_name} · {item.due}
        </span>
      </span>
      <StatusText value={item.status} className="small" />
      {item.state === "open" ? (
        <>
          <button
            type="button"
            className="btn compact"
            disabled={act.busy}
            onClick={() => run("done")}
          >
            Done
          </button>
          <button
            type="button"
            className="btn ghost compact"
            disabled={act.busy}
            onClick={() => run("snooze")}
          >
            Snooze
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn ghost compact"
          disabled={act.busy}
          onClick={() => run("reopen")}
        >
          Reopen
        </button>
      )}
    </div>
  );
}

/** Changes Brain made without asking, each with Undo. */
function RecentChanges({ overview }: { overview: PersonalOverview }) {
  const undo = useAction<PersonalOverview>({ refresh: ["personal"], done: () => "Undone" });
  return (
    <Section title="Changed automatically">
      <ul className="list">
        {overview.recent_changes.map((change) => (
          <li key={change.id} className="list-row">
            <span className={`grow ${change.undone ? "muted" : ""}`}>{change.text}</span>
            {change.undone ? (
              <span className="muted small">Undone</span>
            ) : (
              <button
                type="button"
                className="btn ghost compact"
                disabled={undo.busy}
                onClick={() => undo.run(() => send("POST", `/changes/${change.id}/undo`))}
              >
                Undo
              </button>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** The Personal page. */
export default function Personal() {
  const query = usePersonal();
  return (
    <Page title="Personal" subtitle="Your household's errands, appointments and paperwork.">
      <QueryState query={query}>
        {(overview) => (
          <>
            <Section
              title="Open cases"
              aside={`${overview.cases.filter((c) => c.state === "open").length} open`}
            >
              <div className="list">
                {overview.cases.map((item) => (
                  <CaseRow key={item.id} item={item} />
                ))}
              </div>
            </Section>
            <Section title="Domains">
              <div className="grid-tiles">
                {overview.domains.map((domain) => (
                  <div key={domain.name} className="card tile">
                    <span className="row-title">{domain.name}</span>
                    <span className="muted small">{domain.open_cases}</span>
                    <span className="tag">{domain.data_class}</span>
                  </div>
                ))}
              </div>
            </Section>
            <RecentChanges overview={overview} />
          </>
        )}
      </QueryState>
    </Page>
  );
}
