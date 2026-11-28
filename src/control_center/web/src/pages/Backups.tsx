/**
 * @file Backups: where copies live, restore drills, restoring a file or folder, prune plans and
 * paid offsite storage (design: Backups; spec 7.2, 13.5, 13.7). Restoring writes into a side
 * folder and pruning removes snapshots for good, so both ask for the passkey; a prune is also a
 * hold to confirm, and runs only the plan on screen.
 */
import { FlaskConical, Scissors, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useBackups } from "../api/queries";
import type { BackupsOverview, PrunePlan } from "../api/types";
import { HoldButton } from "../components/HoldButton";
import { Page, Section } from "../components/Page";
import { PaidFeatureCard } from "../components/PaidFeatureCard";
import { QueryState } from "../components/QueryState";
import { Reveal } from "../components/Reflow";
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

/** The last drill, Run a restore drill, and earlier drills. */
function Drill({ overview }: { overview: BackupsOverview }) {
  const run = useAction<BackupsOverview>({
    refresh: ["backups", "schedule"],
    done: (result) => `Restore drill: ${result.drill.status.label}`,
  });
  return (
    <Section title="Restore drill">
      <div className="card stack">
        <StatusText value={overview.drill.status} />
        <p className="small muted">{overview.drill.detail}</p>
        <button
          type="button"
          className="btn"
          disabled={run.busy}
          onClick={() => void run.run(() => send("POST", "/backups/drill"))}
        >
          <FlaskConical size={18} aria-hidden="true" />
          Run a restore drill
        </button>
      </div>
      <RowList rows={overview.drills} />
    </Section>
  );
}

/** A prune plan: what goes, what it frees and what stays, then hold to prune or discard. */
function Plan({ plan }: { plan: PrunePlan }) {
  const prune = useAction<{ message: string }>({
    refresh: ["backups"],
    done: (result) => result.message,
  });
  const discard = useAction<BackupsOverview>({ refresh: ["backups"], done: () => "Plan put away" });
  return (
    <div className="card stack">
      <p className="row-title">Frees {plan.frees}</p>
      <RowList rows={plan.removes} />
      <p className="small muted">Kept: {plan.keeps}</p>
      <HoldButton
        label="Prune these snapshots"
        disabled={prune.busy}
        onConfirm={() =>
          void prune.run((proof) => send("POST", "/backups/prune", { plan_id: plan.id }, proof))
        }
      />
      <button
        type="button"
        className="btn ghost"
        disabled={discard.busy}
        onClick={() => void discard.run(() => send("POST", "/backups/prune-plan/discard"))}
      >
        <X size={18} aria-hidden="true" />
        Discard plan
      </button>
    </div>
  );
}

/** Start a prune plan, which removes nothing until it is held to confirm. */
function Prune({ overview }: { overview: BackupsOverview }) {
  const start = useAction<BackupsOverview>({ refresh: ["backups"] });
  const plan = overview.prune_plan;
  return (
    <Section title="Pruning" aside={overview.last_prune}>
      {!plan && (
        <button
          type="button"
          className="btn"
          disabled={start.busy}
          onClick={() => void start.run(() => send("POST", "/backups/prune-plan"))}
        >
          <Scissors size={18} aria-hidden="true" />
          Start a prune plan
        </button>
      )}
      <Reveal when={plan !== null}>{plan && <Plan plan={plan} />}</Reveal>
    </Section>
  );
}

/** The Backups page. */
export default function Backups() {
  const query = useBackups();
  return (
    <QueryState query={query}>
      {(overview) => (
        <Page title="Backups" subtitle={<StatusText value={overview.mode} />}>
          {overview.mode.status === "attention" ? (
            <div className="banner attention" role="status">
              <span className="grow">▲ {overview.mode_note}</span>
            </div>
          ) : (
            <p className="muted">{overview.mode_note}</p>
          )}
          <Section title="Copies">
            <RowList rows={overview.targets} />
          </Section>
          <Drill overview={overview} />
          <Section title="Restore">
            <Restore overview={overview} />
          </Section>
          <Prune overview={overview} />
          <Section title="Paid offsite storage" aside="The same panel as Spend">
            <PaidFeatureCard feature={overview.offsite} />
          </Section>
          <Section title="Kept for">
            <RowList rows={overview.retention} />
          </Section>
        </Page>
      )}
    </QueryState>
  );
}
