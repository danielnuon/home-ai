/**
 * @file Today: the one page that answers "is everything all right, and does anything need me?"
 * (design: Today; spec 7.2).
 *
 * Top to bottom: the open critical decision if there is one, what needs the Owner, the live field,
 * the day's agenda, the team, and system tiles.
 */
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
import { useStaleStatus } from "../design/stale";
import { StatusText } from "../design/status";

const COUNT_WORDS = [
  "Nothing needs you",
  "One thing needs you",
  "Two things need you",
  "Three things need you",
];

/** The status chips under the greeting. */
function StatusChips({ today }: { today: TodayOverview }) {
  const platform = usePlatform().data;
  const running = today.tasks.filter((task) => !task.queued).length;
  return (
    <div className="row wrap" style={{ ["--gap" as string]: "var(--space-2)" }}>
      {platform && <StatusText value={platform.overall} className="chip" />}
      <span className="chip status-in_progress">◐ {running} working</span>
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
      {today.needs_you.map((approval) => (
        <ApprovalCard key={approval.id} approval={approval} />
      ))}
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
    <Section title="Team, right now" aside={<Link to="/directory">Directory</Link>}>
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
    <div className="list">
      <SettingRow setting={away} />
    </div>
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

/** The Today page. */
export default function Today() {
  const query = useToday();
  return (
    <QueryState query={query}>
      {(today) => (
        <Page title={today.greeting} subtitle={today.date} actions={<StatusChips today={today} />}>
          <SetupNudge today={today} />
          {today.open_decision && <DecisionCard decision={today.open_decision} />}
          <div className="columns">
            <div className="stack" style={{ ["--gap" as string]: "var(--space-6)" }}>
              <NeedsYou today={today} />
              <LiveCard tasks={today.tasks} />
            </div>
            <div className="stack" style={{ ["--gap" as string]: "var(--space-6)" }}>
              <Agenda today={today} />
              <Team today={today} />
            </div>
          </div>
          <Systems today={today} />
          <Section title="How it's running">
            <MetricTiles metrics={today.metrics} />
          </Section>
          <AwayMode />
        </Page>
      )}
    </QueryState>
  );
}
