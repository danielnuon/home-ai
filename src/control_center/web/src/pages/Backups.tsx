/**
 * @file Backups: where copies live, the last restore drill, and restoring a file or folder
 * (design: Backups). Restoring writes over live data, so the gate asks for the passkey.
 */
import { useState, type FormEvent } from "react";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useBackups } from "../api/queries";
import type { BackupsOverview } from "../api/types";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { RowList } from "../components/Rows";
import { StatusText } from "../design/status";

/** Choose a restore point and what to bring back. */
function Restore({ overview }: { overview: BackupsOverview }) {
  const [what, setWhat] = useState("");
  const [point, setPoint] = useState(overview.restore_points[0] ?? "");
  const restore = useAction<{ message: string }>({ done: (result) => result.message });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void restore.run((proof) => send("POST", "/backups/restore", { what, point }, proof));
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <input
        className="field"
        aria-label="File or folder to restore"
        placeholder="File or folder, for example ~/Documents/Taxes"
        value={what}
        onChange={(event) => setWhat(event.target.value)}
      />
      <select
        className="field select"
        aria-label="Restore point"
        value={point}
        onChange={(event) => setPoint(event.target.value)}
      >
        {overview.restore_points.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
      <button type="submit" className="btn primary" disabled={restore.busy || !what.trim()}>
        Restore
      </button>
    </form>
  );
}

/** The Backups page. */
export default function Backups() {
  const query = useBackups();
  return (
    <QueryState query={query}>
      {(overview) => (
        <Page title="Backups" subtitle={<StatusText value={overview.mode} />}>
          <p className="muted">{overview.mode_note}</p>
          <Section title="Copies">
            <RowList rows={overview.targets} />
          </Section>
          <Section title="Restore drill">
            <div className="card stack">
              <StatusText value={overview.drill.status} />
              <p className="small muted">{overview.drill.detail}</p>
            </div>
          </Section>
          <Section title="Restore">
            <Restore overview={overview} />
          </Section>
          <Section title="Kept for">
            <RowList rows={overview.retention} />
          </Section>
        </Page>
      )}
    </QueryState>
  );
}
