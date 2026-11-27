/**
 * @file Today: the one page that answers "is everything all right, and does anything need me?"
 * (design: Today; spec 7.2).
 *
 * The status chips, the setup nudge and the open critical decision always sit at the top. Below
 * them is a grid of widgets the Owner can reorder, resize and hide (spec 7.2, "Customizable
 * widgets"); the recommended default leads with Needs you and Live, then the day, work, team and
 * away mode, then health and systems. Needs you is pinned: it can move but never leave Today. The
 * chips count blocked threads and threads ready for review; those stay out of Needs you, because
 * nothing waits on them (spec 15.8.9).
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { usePlatform, useSettings, useToday } from "../api/queries";
import type { Tile, TodayOverview } from "../api/types";
import { ApprovalCard } from "../components/ApprovalCard";
import { Avatar } from "../components/Avatar";
import { DecisionCard } from "../components/DecisionCard";
import { LiveCard } from "../components/LiveCard";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { MetricTiles } from "../components/Rows";
import { SettingRow } from "../components/SettingControl";
import { Sheet } from "../components/Sheet";
import { ThreadCard } from "../components/ThreadCard";
import { useStaleStatus } from "../design/stale";
import { AnimatePresence, LEAVE, m } from "../design/motion";
import { useToast } from "../components/Toasts";
import { StatusText } from "../design/status";
import {
  currentLayout,
  DEFAULT_LAYOUT,
  hideWidget,
  moveWidget,
  placeAt,
  resizeWidget,
  showWidget,
  sizeOf,
  useHomeLayout,
  visible,
  WIDGETS,
  type HomeLayout,
  type WidgetId,
} from "./today/homeLayout";
import { WidgetFrame } from "./today/WidgetFrame";

const COUNT_WORDS = [
  "Nothing needs you",
  "One thing needs you",
  "Two things need you",
  "Three things need you",
];

/** The status chips under the greeting. */
function StatusChips({ today }: { today: TodayOverview }) {
  const platform = usePlatform().data;
  const running = today.tasks.filter((task) => task.session_state === "running").length;
  return (
    <div className="row wrap" style={{ ["--gap" as string]: "var(--space-2)" }}>
      {platform && <StatusText value={platform.overall} className="chip" />}
      <span className="chip status-in_progress">◐ {running} working</span>
      {today.blocked_threads > 0 && (
        <Link to="/work" className="chip status-problem">
          ■ {today.blocked_threads} blocked
        </Link>
      )}
      {today.review_ready_threads > 0 && (
        <Link to="/work" className="chip status-healthy">
          ● {today.review_ready_threads} ready for review
        </Link>
      )}
      <Link to="/spend" className="chip">
        {today.spend_label}
      </Link>
    </div>
  );
}

function NeedsYou({ today }: { today: TodayOverview }) {
  const words = COUNT_WORDS[today.needs_you_count] ?? `${today.needs_you_count} things need you`;
  return (
    <Section title={words} aside={<Link to="/approvals">All approvals</Link>}>
      <AnimatePresence initial={false} mode="popLayout">
        {today.needs_you.map((approval) => (
          <m.div key={approval.id} layout="position" exit={LEAVE}>
            <ApprovalCard approval={approval} />
          </m.div>
        ))}
        {today.needs_you_threads.map((thread) => (
          <m.div key={thread.id} layout="position" exit={LEAVE}>
            <ThreadCard thread={thread} />
          </m.div>
        ))}
      </AnimatePresence>
    </Section>
  );
}

function Agenda({ today }: { today: TodayOverview }) {
  return (
    <Section title="Today">
      <ul className="list">
        {today.agenda.map((item) => (
          <li key={item.id} className="list-row">
            <span className="mono small agenda-time">{item.time}</span>
            <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
              <span className="row-title">{item.title}</span>
              <span className="muted small">{item.meta}</span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Team({ today }: { today: TodayOverview }) {
  return (
    <Section title="Team" aside={<Link to="/directory">Directory</Link>}>
      <div className="team-strip">
        {today.team.map((member) => (
          <div key={member.id} className="team-member">
            <Avatar
              department={member.department}
              state={member.state}
              name={member.name}
              rate={member.tokens_per_second}
            />
            <span className="small row-title">{member.name}</span>
            <span className="tiny muted">{member.doing}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

/** One system tile, linking to its page; grey with "Stale" once 3 minutes old (spec 7.3). */
function SystemTile({ tile }: { tile: Tile }) {
  const stale = useStaleStatus(tile.sampled_at);
  return (
    <Link to={tile.href} className={`card tile interactive plain-link${stale ? " stale" : ""}`}>
      <span className="muted small">{tile.name}</span>
      <span className="tile-value">{tile.value}</span>
      <StatusText value={stale ?? tile.status} className="small" />
    </Link>
  );
}

/** Systems tiles, each linking to its page. */
function Systems({ today }: { today: TodayOverview }) {
  return (
    <Section title="Systems">
      <div className="grid-tiles">
        {today.tiles.map((tile) => (
          <SystemTile key={tile.name} tile={tile} />
        ))}
      </div>
    </Section>
  );
}

/** Away mode lives on Today (its owner page) as well as in Settings. */
function AwayMode() {
  const away = useSettings().data?.settings.find((setting) => setting.key === "away_mode");
  if (!away) return null;
  return (
    <Section title="Away mode">
      <div className="list">
        <SettingRow setting={away} />
      </div>
    </Section>
  );
}

function SetupNudge({ today }: { today: TodayOverview }) {
  if (!today.setup) return null;
  const { required_done, required_total } = today.setup;
  return (
    <Link to="/setup" className="card row interactive plain-link">
      <span className="grow">
        <span className="row-title">Finish setting up</span>
        <span className="muted small">
          {" "}
          · {required_done} of {required_total} required steps done
        </span>
      </span>
      <span className="status-attention small">▲ Setup</span>
    </Link>
  );
}

/** Threads by state, each opening Work. */
function WorkSummary({ today }: { today: TodayOverview }) {
  const running = today.tasks.filter((task) => task.session_state === "running").length;
  const rows = [
    { label: "Needs you", count: today.needs_you_count, tone: "status-attention" },
    { label: "Blocked", count: today.blocked_threads, tone: "status-problem" },
    { label: "Ready for review", count: today.review_ready_threads, tone: "status-healthy" },
    { label: "Working", count: running, tone: "status-in_progress" },
  ];
  return (
    <Section title="Work" aside={<Link to="/work">Threads</Link>}>
      <div className="list">
        {rows.map((row) => (
          <Link key={row.label} to="/work" className="list-row plain-link">
            <span className="grow">{row.label}</span>
            <span className={`mono ${row.count ? row.tone : "muted"}`}>{row.count}</span>
          </Link>
        ))}
      </div>
    </Section>
  );
}

/** What each widget shows. */
function WidgetBody({ id, today }: { id: WidgetId; today: TodayOverview }) {
  switch (id) {
    case "needs":
      return <NeedsYou today={today} />;
    case "live":
      return <LiveCard tasks={today.tasks} />;
    case "agenda":
      return <Agenda today={today} />;
    case "work":
      return <WorkSummary today={today} />;
    case "team":
      return <Team today={today} />;
    case "away":
      return <AwayMode />;
    case "health":
      return (
        <Section title="How it's running">
          <MetricTiles metrics={today.metrics} />
        </Section>
      );
    case "systems":
      return <Systems today={today} />;
  }
}

/** The hidden widgets, to put back. */
function AddWidgetSheet({
  layout,
  open,
  onAdd,
  onClose,
}: {
  layout: HomeLayout;
  open: boolean;
  onAdd: (id: WidgetId) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} title="Add a widget" onClose={onClose}>
      {layout.hidden.length === 0 ? (
        <p className="muted">Every widget is on Today.</p>
      ) : (
        <div className="list">
          {layout.hidden.map((id) => (
            <button key={id} type="button" className="list-row" onClick={() => onAdd(id)}>
              <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
                <span className="row-title">{WIDGETS[id].name}</span>
                <span className="muted small">{WIDGETS[id].description}</span>
              </span>
              <span className="muted" aria-hidden="true">
                +
              </span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/** Customize, or while customizing: Add widget, Reset and Done. */
function HomeTools({
  editing,
  hidden,
  onEdit,
  onAdd,
  onReset,
}: {
  editing: boolean;
  hidden: number;
  onEdit: (editing: boolean) => void;
  onAdd: () => void;
  onReset: () => void;
}) {
  return (
    <div className="row wrap home-tools">
      {editing ? (
        <>
          <p className="muted small grow">
            Drag a widget by its handle or use the arrows. Needs you, the critical decision and the
            status chips always stay on Today.
          </p>
          <button type="button" className="btn compact" disabled={hidden === 0} onClick={onAdd}>
            Add widget{hidden > 0 && ` (${hidden})`}
          </button>
          <button type="button" className="btn ghost compact" onClick={onReset}>
            Reset
          </button>
          <button type="button" className="btn primary compact" onClick={() => onEdit(false)}>
            Done
          </button>
        </>
      ) : (
        <button type="button" className="btn ghost compact" onClick={() => onEdit(true)}>
          Customize
        </button>
      )}
    </div>
  );
}

/** The widget grid, and the controls to customize it. */
function Widgets({ today }: { today: TodayOverview }) {
  const [layout, setLayout] = useHomeLayout();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const shown = visible(layout);

  const change = (next: HomeLayout, message?: string) => {
    const before = layout;
    setLayout(next);
    if (message) toast({ message, undo: () => setLayout(before) });
  };

  return (
    <>
      <HomeTools
        editing={editing}
        hidden={layout.hidden.length}
        onEdit={setEditing}
        onAdd={() => setAdding(true)}
        onReset={() => change(DEFAULT_LAYOUT, "Today is back to the recommended layout")}
      />
      <div className="home">
        <div className="home-grid">
          <AnimatePresence initial={false}>
            {shown.map((id, index) => (
              <WidgetFrame
                key={id}
                id={id}
                size={sizeOf(layout, id)}
                editing={editing}
                first={index === 0}
                last={index === shown.length - 1}
                onMove={(step) => change(moveWidget(layout, id, step))}
                onDrop={(target) => setLayout(placeAt(currentLayout(), id, target))}
                onResize={(size) => change(resizeWidget(layout, id, size))}
                onRemove={() => change(hideWidget(layout, id), `${WIDGETS[id].name} removed`)}
              >
                <WidgetBody id={id} today={today} />
              </WidgetFrame>
            ))}
          </AnimatePresence>
        </div>
      </div>
      <AddWidgetSheet
        layout={layout}
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={(id) => {
          setAdding(false);
          change(showWidget(layout, id));
        }}
      />
    </>
  );
}

/** The Today page. */
export default function Today() {
  const query = useToday();
  return (
    <QueryState query={query}>
      {(today) => (
        <Page title={today.greeting} subtitle={today.date} actions={<StatusChips today={today} />}>
          <SetupNudge today={today} />
          {today.open_decision && <DecisionCard decision={today.open_decision} />}
          <Widgets today={today} />
        </Page>
      )}
    </QueryState>
  );
}
