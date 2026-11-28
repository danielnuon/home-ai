/**
 * @file One service's full log, as kept for 30 days and already masked (spec 7.2, Services; 10.10,
 * 13.7). Filter by level; Restart is here too, behind a passkey.
 */
import { RotateCw } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useServiceLog } from "../api/queries";
import type { ServiceLog } from "../api/types";
import { Segmented } from "../components/Controls";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { StatusText } from "../design/status";
import { useGuideContext } from "../shell/Guide";
import { useRestart } from "./Services";

type Level = "all" | "warn";

const LEVELS = [
  { value: "all", label: "Everything" },
  { value: "warn", label: "Warnings and errors" },
] as const;

/** The log lines, newest first, with the chosen filter. */
function Lines({ log }: { log: ServiceLog }) {
  const [level, setLevel] = useState<Level>("all");
  const restart = useRestart(log);
  const lines = log.lines.filter((line) => level === "all" || line.level !== "info");
  useGuideContext(`${log.name} logs`);
  return (
    <>
      <div className="row wrap">
        <Segmented label="Show" value={level} options={LEVELS} onChange={setLevel} />
        {log.restartable && (
          <button type="button" className="btn" onClick={restart}>
            <RotateCw size={18} aria-hidden="true" />
            Restart
          </button>
        )}
      </div>
      <Section title="Log" aside={log.retained}>
        {lines.length === 0 ? (
          <p className="list empty">No warnings or errors in the kept log.</p>
        ) : (
          <ol className="list log-lines">
            {lines.map((line, index) => (
              <li key={`${line.at}-${index}`}>
                <span className="muted">{line.at}</span>
                <span className={line.level === "info" ? "muted" : "tag attention"}>
                  {line.level}
                </span>
                <span>{line.text}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}

/** The service logs page. */
export default function ServiceLogs() {
  const { id = "" } = useParams();
  const query = useServiceLog(id);
  const log = query.data;
  return (
    <Page
      title={log ? `${log.name} logs` : "Logs"}
      subtitle={
        log && (
          <>
            {log.meta} · <StatusText value={log.status} />
          </>
        )
      }
    >
      <QueryState query={query}>{(found) => <Lines log={found} />}</QueryState>
    </Page>
  );
}
