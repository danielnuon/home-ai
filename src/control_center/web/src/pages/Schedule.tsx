/**
 * @file Schedule: recurring jobs, the heavy-work lock, and quiet hours (design: Schedule). Job
 * times and quiet hours change in place (spec 7.2).
 */
import { useState, type FormEvent } from "react";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useSchedule, useSettings } from "../api/queries";
import type { Job, ScheduleOverview } from "../api/types";
import { Switch } from "../components/Controls";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { Reveal } from "../components/Reflow";
import { SettingRow } from "../components/SettingControl";
import { StatusText } from "../design/status";

/** Change a job's start time in place; Cancel or Save, and the row reads the new time. */
function TimeEdit({ job, onDone }: { job: Job; onDone: () => void }) {
  const [time, setTime] = useState(job.time ?? "");
  const save = useAction<ScheduleOverview>({
    refresh: ["schedule"],
    done: () => `${job.name} now starts at ${time}`,
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const done = await save.run(() => send("PUT", `/schedule/${job.id}/time`, { time }));
    if (done) onDone();
  };
  return (
    <form className="time-edit" onSubmit={(event) => void submit(event)}>
      <input
        className="field"
        type="time"
        aria-label={`${job.name} start time`}
        value={time}
        onChange={(event) => setTime(event.target.value)}
      />
      <button
        type="submit"
        className="btn primary compact"
        disabled={save.busy || time === job.time}
      >
        Save
      </button>
      <button type="button" className="btn ghost compact" onClick={onDone}>
        Cancel
      </button>
    </form>
  );
}

/** One job with its switch, Run now and, when it has a start time, Change time. */
function JobRow({ job }: { job: Job }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="service">
      <JobLine job={job} editing={editing} onEdit={() => setEditing(!editing)} />
      <Reveal when={editing}>
        <TimeEdit job={job} onDone={() => setEditing(false)} />
      </Reveal>
    </div>
  );
}

/** The job's line: name, timing, Change time, Run now and the switch. */
function JobLine({ job, editing, onEdit }: { job: Job; editing: boolean; onEdit: () => void }) {
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
      {job.time && (
        <button
          type="button"
          className="btn ghost compact"
          aria-expanded={editing}
          onClick={onEdit}
        >
          Change time
        </button>
      )}
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
