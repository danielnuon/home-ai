/**
 * @file Models: which local model serves each family, the pool's mode and queue, a pending model
 * plan with its veto, pins, Run selection now, the Routing panel, candidate cards, the Tokens panel
 * with its caps, the independent reviewer option and the metric trends (design: Models; spec 7.2,
 * 7.18, 8.6, 8.8.7, 8.10).
 */
import { RefreshCw } from "lucide-react";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useDecisions, useModels, useSettings } from "../api/queries";
import type { ModelsOverview, SourcedFigure } from "../api/types";
import { DecisionCard } from "../components/DecisionCard";
import { ImpactCard } from "../components/ImpactCard";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { MetricTiles } from "../components/Rows";
import { SettingRow } from "../components/SettingControl";
import { Trends } from "../components/Trends";
import { StatusText } from "../design/status";
import { Families } from "./models/Families";
import { Candidates, FigureGrid, Routing } from "./models/Panels";

/** The independent reviewer switch, from the shared settings. */
function ReviewerSetting() {
  const setting = useSettings().data?.settings.find((s) => s.key === "models.review.independent");
  return setting ? (
    <div className="list">
      <SettingRow setting={setting} />
    </div>
  ) : null;
}

/** One group of figures, each with where it comes from (spec 7.18). */
function Figures({ title, figures }: { title: string; figures: SourcedFigure[] }) {
  return (
    <div className="stack" style={{ ["--gap" as string]: "var(--space-1)" }}>
      <h3 className="small muted">{title}</h3>
      <ul className="list">
        {figures.map((figure) => (
          <li key={figure.name} className="list-row">
            <span className="grow row-title">{figure.name}</span>
            <span className="small">{figure.value}</span>
            <span className="tag">{figure.source}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The token caps, from the shared settings. Lowering one is one tap; raising one asks. */
function TokenCaps() {
  const caps = (useSettings().data?.settings ?? []).filter((setting) =>
    setting.key.startsWith("models.tokens."),
  );
  return (
    <div className="list">
      {caps.map((setting) => (
        <SettingRow key={setting.key} setting={setting} />
      ))}
    </div>
  );
}

/** The Tokens panel: how fast the GPU turns tokens into finished work (spec 8.8.7). */
function Tokens({ tokens }: { tokens: ModelsOverview["tokens"] }) {
  return (
    <Section title="Tokens">
      <Figures title="Speed and use" figures={tokens.speeds} />
      <Figures title="Tokens per outcome, by role" figures={tokens.tokens_per_outcome} />
      <Figures title="GPU-seconds today, by priority" figures={tokens.gpu_seconds} />
      <h3 className="small muted">Caps</h3>
      <ImpactCard lines={tokens.cap_impact} />
      <TokenCaps />
    </Section>
  );
}

/** A pending model plan from the selector, with its veto (spec 8.6, 11.9). */
function PendingPlan({ ids }: { ids: string[] }) {
  const plans = (useDecisions().data ?? []).filter((d) => ids.includes(d.id) && d.vetoable);
  if (plans.length === 0) return null;
  return (
    <Section title="Pending plan" to={{ path: "/decisions", label: "Decisions" }}>
      <div className="stack">
        {plans.map((decision) => (
          <DecisionCard key={decision.id} decision={decision} />
        ))}
      </div>
    </Section>
  );
}

/** When the selector last ran, and Run selection now. */
function Selection({ selection }: { selection: ModelsOverview["selection"] }) {
  const run = useAction<ModelsOverview>({
    refresh: ["models", "schedule"],
    done: (models) => models.selection.status.label,
  });
  return (
    <Section title="Selection">
      <div className="card stack">
        <span className="row">
          <span className="grow muted small">{selection.last_run}</span>
          <StatusText value={selection.status} className="small" />
        </span>
        <button
          type="button"
          className="btn"
          disabled={run.busy || selection.queued}
          onClick={() => void run.run(() => send("POST", "/models/selection"))}
        >
          <RefreshCw size={18} aria-hidden="true" />
          {selection.queued ? "Selection queued" : "Run selection now"}
        </button>
      </div>
    </Section>
  );
}

/** The Models page. */
export default function Models() {
  const query = useModels();
  return (
    <QueryState query={query}>
      {(models) => (
        <Page
          title="Models"
          subtitle={`${models.pool_mode} · ${models.resident} resident · ${models.swaps_today}`}
        >
          <MetricTiles metrics={models.stats} />
          <PendingPlan ids={models.plan_decisions} />
          <Families models={models} />
          <Section title="Queue and split">
            <FigureGrid figures={[...models.queue, ...models.split]} />
          </Section>
          <Selection selection={models.selection} />
          <Routing routing={models.routing} />
          <Candidates candidates={models.candidates} />
          <Tokens tokens={models.tokens} />
          <Section title="Independent reviewer">
            <ReviewerSetting />
            <ImpactCard lines={models.reviewer_impact} />
          </Section>
          <Trends page="models" />
        </Page>
      )}
    </QueryState>
  );
}
