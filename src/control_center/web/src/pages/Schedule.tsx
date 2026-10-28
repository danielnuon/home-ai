/**
 * @file Schedule: recurring jobs, the heavy-work lock, and quiet hours (design: Schedule).
 */
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useSchedule, useSettings } from "../api/queries";
import type { Job, ScheduleOverview } from "../api/types";
import { Switch } from "../components/Controls";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { SettingRow } from "../components/SettingControl";
import { StatusText } from "../design/status";

/** One job with its switch and Run now. */
function JobRow({ job }: { job: Job }) {
  const act = useAction<ScheduleOverview>({ refresh: ["schedule"] });
  return (
    <div className="list-row">
      <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
        <span className="row-title">
          {job.name} {job.heavy && <span className="tag">heavy</span>}
        </span>
        <span className="muted small">
          {job.when} · next {job.next_run} · last <StatusText value={job.last_run} />
        </span>
      </span>
      <button
        type="button"
        className="btn ghost compact"
        disabled={act.busy}
        onClick={() => act.run(() => send("POST", `/schedule/${job.id}/run`))}
      >
        Run now
      </button>
      <Switch
        checked={!job.paused}
        label={`${job.name} scheduled`}
        disabled={act.busy}
        onChange={(on) =>
          act.run((proof) => send("PUT", `/schedule/${job.id}/paused`, { paused: !on }, proof))
        }
      />
    </div>
  );
}

/** Quiet hours are owned here and also listed in Settings. */
function QuietHours() {
  const setting = useSettings().data?.settings.find((s) => s.key === "quiet_hours");
  return setting ? (
    <div className="list">
      <SettingRow setting={setting} />
    </div>
  ) : null;
}

/** The Schedule page. */
export default function Schedule() {
  const query = useSchedule();
  return (
    <QueryState query={query}>
      {(schedule) => (
        <Page
          title="Schedule"
          subtitle={`Now ${schedule.now} · quiet hours ${schedule.quiet_hours}`}
        >
          <div className="card row">
            <span className="grow">Heavy-work lock</span>
            <StatusText value={schedule.lock} className="small" />
          </div>
          <QuietHours />
          <Section title="Jobs">
            <div className="list">
              {schedule.jobs.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </div>
          </Section>
        </Page>
      )}
    </QueryState>
  );
}
