/**
 * @file System: the Mac's memory, pressure and health at a glance, with the controls that change
 * them (design: System; spec 7.2, 8.3, 8.11). The pool mode, Desk mode, an on-demand health
 * check, the container lanes, CPU classes, the thermal ladder, each drive against its thresholds
 * and development's share of model time; a pressure drill sits in the "…" menu.
 */
import { Activity, Gauge, Layers, StopCircle } from "lucide-react";
import { useState } from "react";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useSettings, useSystem } from "../api/queries";
import type { DriveUse, MemoryZone, PoolMode, PoolState, SystemOverview } from "../api/types";
import { ImpactCard } from "../components/ImpactCard";
import { useMoreMenu } from "../components/MoreMenu";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { Reveal } from "../components/Reflow";
import { MetricTiles, RowList } from "../components/Rows";
import { SettingRow } from "../components/SettingControl";
import { Sheet } from "../components/Sheet";
import { Trends } from "../components/Trends";
import { StatusText } from "../design/status";
import { clockTime } from "../design/time";

/**
 * One color per memory zone, in the order of spec 8.3 (macOS, containers, services, model pool,
 * headroom), matching the design canvas. Headroom stays neutral because it is never allocated.
 */
export const ZONE_COLORS = [
  "var(--mist-fill)",
  "var(--data-2)",
  "var(--data-3)",
  "var(--data-1)",
  "var(--line-strong)",
];

/** The color for the zone at `index`; wraps around if the budget ever gains zones. */
export function zoneColor(index: number): string {
  return ZONE_COLORS[index % ZONE_COLORS.length] ?? "var(--line-strong)";
}

/** Memory zones as one bar, each zone's share of its budget, with a legend in words. */
function MemoryBar({ zones }: { zones: MemoryZone[] }) {
  const total = zones.reduce((sum, zone) => sum + zone.budget_gb, 0) || 1;
  return (
    <div className="stack">
      <div className="memory-bar" aria-hidden="true">
        {zones.map((zone, index) => (
          <span
            key={zone.name}
            style={{ flexGrow: zone.budget_gb / total, background: zoneColor(index) }}
          >
            <span style={{ transform: `scaleX(${Math.min(zone.used_gb / zone.budget_gb, 1)})` }} />
          </span>
        ))}
      </div>
      <ul className="legend small">
        {zones.map((zone, index) => (
          <li key={zone.name}>
            <span className="swatch" style={{ background: zoneColor(index) }} aria-hidden="true" />
            {zone.name} · {zone.used_gb} of {zone.budget_gb} GB
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A filled bar with marks; `marks` and `floor` are percentages of the whole. */
function Meter({
  value,
  marks = [],
  floor,
  tone,
  label,
}: {
  value: number;
  marks?: number[];
  floor?: number;
  tone?: "attention";
  label: string;
}) {
  return (
    <div
      className={`meter ${tone ?? ""}`}
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className="meter-fill" style={{ transform: `scaleX(${Math.min(value, 100) / 100})` }} />
      {marks.map((mark) => (
        <span key={mark} className="meter-mark" style={{ left: `${mark}%` }} />
      ))}
      {floor !== undefined && <span className="meter-mark floor" style={{ left: `${floor}%` }} />}
    </div>
  );
}

/** The sheet that changes the pool mode: each mode as a button with what it would do. */
function PoolModeSheet({
  pool,
  open,
  onClose,
}: {
  pool: PoolState;
  open: boolean;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<PoolMode>(pool.mode);
  const act = useAction<SystemOverview>({
    refresh: ["system", "models", "today"],
    done: (system) => system.pool.label,
  });
  const option = pool.options.find((o) => o.mode === chosen);
  const apply = async () => {
    const done = await act.run(() => send("PUT", "/system/pool-mode", { mode: chosen }));
    if (done) onClose();
  };
  return (
    <Sheet open={open} title="Pool mode" onClose={onClose}>
      <div className="stack">
        <div className="option-list" role="group" aria-label="Pool mode">
          {pool.options.map((o) => (
            <button
              key={o.mode}
              type="button"
              className="option-card"
              aria-pressed={o.mode === chosen}
              onClick={() => setChosen(o.mode)}
            >
              <span className="row-title">
                {o.label} {o.mode === pool.mode && <span className="tag">now</span>}
              </span>
              <span className="muted small">{o.note}</span>
            </button>
          ))}
        </div>
        <Reveal when={chosen !== pool.mode}>
          {option && <ImpactCard lines={option.impact} />}
        </Reveal>
        <button
          type="button"
          className="btn primary"
          disabled={act.busy || chosen === pool.mode}
          onClick={() => void apply()}
        >
          Switch to {option?.label.split(" · ")[0] ?? "this mode"}
        </button>
      </div>
    </Sheet>
  );
}

/** The pool mode, what is loaded, and the buttons that change it. */
function Pool({ pool }: { pool: PoolState }) {
  const [open, setOpen] = useState(false);
  const end = useAction<SystemOverview>({
    refresh: ["system", "models", "today"],
    done: () => "Image mode ended · back to mode L",
  });
  return (
    <div className="card stack">
      <div className="row">
        <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
          <span className="row-title">{pool.label}</span>
          <span className="muted small">{pool.loaded.join(" · ")}</span>
        </span>
      </div>
      <div className="row wrap">
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          <Layers size={18} aria-hidden="true" />
          Change mode
        </button>
        {pool.can_end && (
          <button
            type="button"
            className="btn"
            disabled={end.busy}
            onClick={() => void end.run(() => send("POST", "/system/pool-mode/end"))}
          >
            <StopCircle size={18} aria-hidden="true" />
            End image mode
          </button>
        )}
      </div>
      <PoolModeSheet key={pool.mode} pool={pool} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

/** Desk mode, from the shared settings (spec 8.11.2). */
function DeskMode() {
  const setting = useSettings().data?.settings.find((s) => s.key === "resources.desk_mode");
  return setting ? (
    <div className="list">
      <SettingRow setting={setting} />
    </div>
  ) : null;
}

/** The health-check button and the last result. */
function HealthCheck({ system }: { system: SystemOverview }) {
  const check = useAction<SystemOverview>({
    refresh: ["system"],
    done: (result) => `Health check: ${result.health_check?.summary.label ?? "done"}`,
  });
  const result = system.health_check;
  return (
    <div className="stack">
      <button
        type="button"
        className="btn"
        disabled={check.busy}
        onClick={() => void check.run(() => send("POST", "/system/health-check"))}
      >
        <Activity size={18} aria-hidden="true" />
        Run a health check
      </button>
      <Reveal when={result !== null}>
        {result && (
          <div className="stack">
            <p className="small">
              <StatusText value={result.summary} /> · checked {clockTime(result.at)}
            </p>
            <RowList rows={result.rows} />
          </div>
        )}
      </Reveal>
    </div>
  );
}

/** One drive against its thresholds and, on the working drive, the development floor. */
function Drive({ drive }: { drive: DriveUse }) {
  const floor = drive.floor_gb === null ? undefined : 100 - (drive.floor_gb / drive.size_gb) * 100;
  return (
    <li className="list-row">
      <span className="grow stack">
        <span className="row">
          <span className="row-title grow">{drive.name}</span>
          <StatusText value={drive.status} className="small" />
        </span>
        <Meter
          value={drive.used_pct}
          marks={drive.thresholds}
          floor={floor}
          tone={drive.used_pct >= (drive.thresholds[0] ?? 100) ? "attention" : undefined}
          label={`${drive.name} used`}
        />
        <span className="muted small">
          {drive.used_pct}% used · {drive.free_gb.toLocaleString()} GB free · {drive.next_action}
        </span>
      </span>
    </li>
  );
}

/** What is kept for development: the container lanes and its share of model time (8.11). */
function Reservations({ system }: { system: SystemOverview }) {
  const share = system.model_time;
  return (
    <>
      <Section title="Container lanes" aside="Never lend to each other">
        <ul className="list">
          {system.lanes.map((lane) => (
            <li key={lane.name} className="list-row">
              <span className="grow stack">
                <span className="row-title">
                  {lane.name} · {lane.used_gb} of {lane.reserved_gb} GB
                </span>
                <Meter
                  value={(lane.used_gb / lane.reserved_gb) * 100}
                  label={`${lane.name} lane`}
                />
                <span className="muted small">{lane.meta}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Model time for development" aside="24 hours">
        <div className="card stack">
          <span className="row">
            <span className="grow row-title">
              {share.share_pct}% · floor {share.floor_pct}%
            </span>
            <StatusText value={share.status} className="small" />
          </span>
          <Meter value={share.share_pct} floor={share.floor_pct} label="Development's share" />
          <span className="muted small">{share.note}</span>
        </div>
      </Section>
    </>
  );
}

/** CPU classes, the thermal ladder and the drives (spec 8.11.3 to 8.11.5). */
function Resources({ system }: { system: SystemOverview }) {
  return (
    <>
      <Reservations system={system} />
      <Section title="CPU by priority class">
        <ul className="list">
          {system.cpu.map((cpu) => (
            <li key={cpu.name} className="list-row">
              <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
                <span className="row-title">{cpu.name}</span>
                <span className="muted small">
                  {cpu.members} · {cpu.setting}
                </span>
              </span>
              <span className="small">{cpu.share}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Thermal ladder">
        <div className="card stack" style={{ ["--gap" as string]: "2px" }}>
          <span className="row">
            <span className="grow row-title">{system.thermal.step}</span>
            <StatusText value={system.thermal.state} className="small" />
          </span>
          <span className="muted small">
            {system.thermal.serious_minutes} serious minutes today · {system.thermal.note}
          </span>
        </div>
      </Section>
      <Section title="Drives" aside="Prune 75% · alert 85% · hold 90% · critical 95%">
        <ul className="list">
          {system.drives.map((drive) => (
            <Drive key={drive.id} drive={drive} />
          ))}
        </ul>
      </Section>
    </>
  );
}

/** The page's "…" menu: the pressure drill, which steps through each degraded state. */
function PageMenu({ system }: { system: SystemOverview }) {
  const drill = useAction<SystemOverview>({
    refresh: ["system", "platform", "live", "schedule"],
    done: (result) => `Pressure drill: ${result.pressure.label}`,
  });
  const next = { normal: "warning", warning: "critical", critical: "normal" }[
    system.pressure_level
  ];
  const { triggerProps, button, menu } = useMoreMenu(
    [
      {
        label: `Pressure drill: go to ${next}`,
        icon: Gauge,
        onSelect: () => void drill.run(() => send("POST", "/system/pressure-drill")),
      },
    ],
    "System",
  );
  return (
    <span {...triggerProps}>
      {button}
      {menu}
    </span>
  );
}

/** The System page. */
export default function System() {
  const query = useSystem();
  return (
    <QueryState query={query}>
      {(system) => (
        <Page
          title="System"
          subtitle={<StatusText value={system.summary} />}
          actions={<PageMenu system={system} />}
        >
          <Section title="Memory" aside={system.machine}>
            <div className="card stack">
              <MemoryBar zones={system.zones} />
              <p className="small">
                Pressure <StatusText value={system.pressure} /> · swap {system.swap}
              </p>
            </div>
          </Section>
          <Section title="Model pool">
            <Pool pool={system.pool} />
            <DeskMode />
          </Section>
          <MetricTiles metrics={system.tiles} />
          <Resources system={system} />
          <Section title="Health">
            <RowList rows={system.rows} />
            <HealthCheck system={system} />
          </Section>
          <Trends page="system" />
        </Page>
      )}
    </QueryState>
  );
}
