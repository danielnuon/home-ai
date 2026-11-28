/**
 * @file Maintenance: each product's level, what the maintenance team fixed (each fix reverted
 * after seeing its diff), what it found, trends, and the switch to pause it (design: Maintenance;
 * spec 7.2, 17.20). Raising a product to fix needs the passkey; lowering it to scan is one tap.
 */
import { FileDiff, Undo2 } from "lucide-react";
import { useState } from "react";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useChangeSetting } from "../api/settings";
import { useMaintenance, useSettings } from "../api/queries";
import type { MaintainedProduct, MaintenanceFix, MaintenanceOverview, Setting } from "../api/types";
import { ActionRow } from "../components/ActionRow";
import { Segmented, Switch } from "../components/Controls";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { MetricTiles } from "../components/Rows";
import { Sheet } from "../components/Sheet";
import { TrendList, useTrendRange } from "../components/Trends";
import { Findings } from "./maintenance/Findings";

const LEVELS = [
  { value: "scan", label: "Scan" },
  { value: "fix", label: "Fix" },
] as const;

/** One product's level, through the shared setting so the gate decides what needs a passkey. */
function ProductLevel({ product, setting }: { product: MaintainedProduct; setting: Setting }) {
  const { change, busy } = useChangeSetting(setting);
  return (
    <div className="list-row">
      <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
        <span className="row-title">{product.name}</span>
        <span className="muted small">{product.meta}</span>
      </span>
      <Segmented
        label={`${product.name} maintenance level`}
        value={product.level as "scan" | "fix"}
        options={LEVELS}
        onChange={(level) => {
          if (!busy && level !== product.level) void change(level);
        }}
      />
    </div>
  );
}

/** Each released product's maintenance level. */
function Products({ overview }: { overview: MaintenanceOverview }) {
  const settings = useSettings().data?.settings ?? [];
  return (
    <Section title="Products" aside="Fix needs your passkey">
      <div className="list">
        {overview.products.map((product) => {
          const setting = settings.find((s) => s.key === product.setting_key);
          return setting ? (
            <ProductLevel key={product.repo} product={product} setting={setting} />
          ) : null;
        })}
      </div>
    </Section>
  );
}

/** A fix's diff, then Revert or Reapply. */
function DiffSheet({ fix, onClose }: { fix: MaintenanceFix | null; onClose: () => void }) {
  const revert = useAction<MaintenanceOverview>({
    refresh: ["maintenance"],
    done: () => (fix?.reverted ? `${fix.id} reapplied` : `${fix?.id ?? "Fix"} reverted`),
  });
  const run = async () => {
    if (!fix) return;
    const done = await revert.run(() => send("POST", `/maintenance/fixes/${fix.id}/revert`));
    if (done) onClose();
  };
  return (
    <Sheet open={fix !== null} title={fix?.title ?? "Fix"} onClose={onClose}>
      {fix && (
        <div className="stack">
          <p className="muted small">{fix.meta}</p>
          <pre className="diff" tabIndex={0}>
            {fix.diff.map((line, index) => (
              <span
                key={`${index}-${line}`}
                className={line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : ""}
              >
                {line}
                {"\n"}
              </span>
            ))}
          </pre>
          <button
            type="button"
            className="btn primary"
            disabled={revert.busy}
            onClick={() => void run()}
          >
            <Undo2 size={18} aria-hidden="true" />
            {fix.reverted ? "Reapply this fix" : "Revert this fix"}
          </button>
        </div>
      )}
    </Sheet>
  );
}

/** The fixes from the last batch; each opens its diff before it can be reverted. */
function LastBatch({ overview }: { overview: MaintenanceOverview }) {
  const [shown, setShown] = useState<MaintenanceFix | null>(null);
  return (
    <Section title="Last batch">
      <div className="list">
        {overview.batch.map((fix) => {
          const diff = {
            label: fix.reverted ? "Diff and reapply" : "Diff and revert",
            icon: FileDiff,
            onSelect: () => setShown(fix),
          };
          return (
            <ActionRow
              key={fix.id}
              title={fix.title}
              meta={`${fix.meta}${fix.reverted ? " · reverted" : ""}`}
              start={diff}
              more={[diff]}
            />
          );
        })}
      </div>
      <DiffSheet fix={shown} onClose={() => setShown(null)} />
    </Section>
  );
}

/** Pipeline C's trends over 7 or 30 days. */
function MaintenanceTrends({ overview }: { overview: MaintenanceOverview }) {
  const { range, control } = useTrendRange();
  return (
    <Section title="Trends" aside={control}>
      <TrendList trends={overview.trends} range={range} />
    </Section>
  );
}

/** The Maintenance page. */
export default function Maintenance() {
  const query = useMaintenance();
  const toggle = useAction<MaintenanceOverview>({ refresh: ["maintenance"] });
  return (
    <QueryState query={query}>
      {(overview) => (
        <Page
          title="Maintenance"
          subtitle={overview.summary}
          actions={
            <Switch
              checked={overview.running}
              label="Maintenance running"
              disabled={toggle.busy}
              onChange={(running) =>
                toggle.run((proof) => send("PUT", "/maintenance/running", { running }, proof))
              }
            />
          }
        >
          <MetricTiles metrics={overview.stats} />
          <Products overview={overview} />
          <LastBatch overview={overview} />
          <Findings findings={overview.findings} />
          <MaintenanceTrends overview={overview} />
        </Page>
      )}
    </QueryState>
  );
}
