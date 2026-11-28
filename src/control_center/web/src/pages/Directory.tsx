/**
 * @file Directory: every employee, its profile, lifecycle proposals, and three ways to see the
 * team (design: Directory; spec 7.2, 7.11, 7.16, "Employee and lifecycle proposal").
 *
 * Cards groups employees as the design does; Teams groups them by pipeline with what each is
 * doing now; Org shows each lead with the employees who report to it. Department, pipeline and
 * status filter every view, and both the view and the filters are in the URL. Suggest a role turns
 * the Owner's idea for a new employee into a proposal for Cadence. Disabling an employee tightens
 * and takes one tap; enabling one loosens and asks for the passkey.
 */
import { Power, UserPlus, UserRound } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useDirectory } from "../api/queries";
import type {
  Directory as DirectoryData,
  Employee,
  LifecycleProposal,
  StatusLabel,
} from "../api/types";
import { Avatar } from "../components/Avatar";
import { Segmented, Switch } from "../components/Controls";
import { ALL, FilterMenu } from "../components/FilterMenu";
import { useMoreMenu } from "../components/MoreMenu";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { Reflow, ReflowItem, Swap } from "../components/Reflow";
import { Sheet } from "../components/Sheet";
import { StatusText } from "../design/status";

/** An employee's status, rolled up from its sessions by the engine (spec 15.8.9). */
const EMPLOYEE_STATUS: Record<Employee["status"], StatusLabel> = {
  active_now: { status: "in_progress", label: "Active now" },
  waiting_on_owner: { status: "attention", label: "Waiting on you" },
  blocked: { status: "problem", label: "Blocked" },
  paused: { status: "neutral", label: "Paused" },
  idle: { status: "neutral", label: "Idle" },
  not_yet_hired: { status: "neutral", label: "Not yet hired" },
  disabled: { status: "neutral", label: "Disabled" },
};

const DEPARTMENTS = [
  ["personal", "Personal"],
  ["engineering", "Engineering"],
  ["quality", "Quality"],
  ["ideation", "Ideation"],
  ["governance", "Governance"],
] as const;

const VIEWS = [
  { value: "cards", label: "Cards" },
  { value: "teams", label: "Teams" },
  { value: "org", label: "Org" },
] as const;

type View = (typeof VIEWS)[number]["value"];

/** Turning an employee off or on; on loosens, so the gate asks for the passkey. */
function useEnable(employee: Employee) {
  const toggle = useAction<unknown>({
    refresh: ["directory"],
    done: () => `${employee.name} is ${employee.enabled ? "off" : "on"}`,
  });
  return {
    busy: toggle.busy,
    set: (enabled: boolean) =>
      void toggle.run((proof) =>
        send("PUT", `/directory/${employee.id}/enabled`, { enabled }, proof),
      ),
  };
}

/** The profile sheet's body. */
function Profile({ employee }: { employee: Employee }) {
  const { busy, set } = useEnable(employee);
  return (
    <div className="stack">
      <div className="row">
        <Avatar
          department={employee.department}
          state={employee.state}
          name={employee.name}
          size={56}
        />
        <div className="grow">
          <p className="row-title">{employee.title}</p>
          <p className="muted small">{employee.tagline}</p>
        </div>
      </div>
      <p>{employee.mission}</p>
      <dl className="facts small">
        <dt>Status</dt>
        <dd>
          <StatusText value={EMPLOYEE_STATUS[employee.status]} />
        </dd>
        <dt>Now</dt>
        <dd>{employee.now}</dd>
        <dt>Pipeline</dt>
        <dd>{employee.pipeline}</dd>
        <dt>Model</dt>
        <dd className="mono">{employee.model}</dd>
        <dt>Tools</dt>
        <dd className="mono">{employee.tools.join(", ")}</dd>
        <dt>Hired</dt>
        <dd>{employee.hired}</dd>
        <dt>Tasks done</dt>
        <dd>{employee.tasks_done}</dd>
      </dl>
      <div className="list">
        <div className="list-row">
          <span className="grow row-title">Working</span>
          <Switch
            checked={employee.enabled}
            label={`${employee.name} working`}
            disabled={busy}
            onChange={set}
          />
        </div>
      </div>
    </div>
  );
}

/** One employee as a card that opens the profile, with a "…" menu. */
function EmployeeCard({ employee, onOpen }: { employee: Employee; onOpen: () => void }) {
  const { set } = useEnable(employee);
  const { triggerProps, button, menu } = useMoreMenu(
    [
      { label: "Open profile", icon: UserRound, onSelect: onOpen },
      {
        label: employee.enabled ? `Turn ${employee.name} off` : `Turn ${employee.name} on`,
        icon: Power,
        onSelect: () => set(!employee.enabled),
      },
    ],
    employee.name,
  );
  return (
    <div className="card row employee" {...triggerProps}>
      <button type="button" className="employee-open grow row" onClick={onOpen}>
        <Avatar department={employee.department} state={employee.state} name={employee.name} />
        <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
          <span className="row-title">{employee.name}</span>
          <span className="muted small">{employee.title}</span>
          <span className="small">{employee.now}</span>
          <StatusText value={EMPLOYEE_STATUS[employee.status]} className="small" />
        </span>
      </button>
      {button}
      {menu}
    </div>
  );
}

/** Open lifecycle proposals: hire, retire or change an employee, or the Owner's own idea. */
function Proposals({ directory }: { directory: DirectoryData }) {
  const decide = useAction<unknown>({ refresh: ["directory"] });
  const open = directory.proposals.filter((proposal) => proposal.state === "open");
  if (open.length === 0) return null;
  return (
    <Section title="Proposals">
      {open.map((proposal) => (
        <div key={proposal.id} className="card stack">
          <p>{proposal.text}</p>
          <p className="muted small">{proposal.source}</p>
          <div className="row">
            {(["approve", "decline"] as const).map((decision) => (
              <button
                key={decision}
                type="button"
                className={`btn ${decision === "approve" ? "primary" : ""}`}
                disabled={decide.busy}
                onClick={() =>
                  decide.run((proof) =>
                    send("POST", `/proposals/${proposal.id}/decision`, { decision }, proof),
                  )
                }
              >
                {decision === "approve" ? "Approve" : "Decline"}
              </button>
            ))}
          </div>
        </div>
      ))}
    </Section>
  );
}

/** The sheet where the Owner suggests a new role; it becomes a proposal. */
function SuggestRole({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const { run, busy } = useAction<LifecycleProposal>({
    refresh: ["directory"],
    done: () => "Cadence will review it. It's under Proposals now.",
  });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const sent = await run(() =>
      send<LifecycleProposal>("POST", "/directory/role-suggestions", { title, reason }),
    );
    if (sent) {
      setTitle("");
      setReason("");
      onClose();
    }
  };
  return (
    <Sheet open={open} title="Suggest a role" onClose={onClose}>
      <form className="stack" onSubmit={(event) => void submit(event)}>
        <p className="muted">
          It becomes a proposal. Cadence weighs it at the next monthly review, and a new employee's
          tools and permissions go through a work item.
        </p>
        <input
          className="field"
          aria-label="Role"
          placeholder="Role, such as Gardener"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <textarea
          className="field"
          rows={3}
          aria-label="Why it's needed"
          placeholder="Why it's needed"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <button type="submit" className="btn primary" disabled={busy || !title.trim()}>
          Suggest it
        </button>
      </form>
    </Sheet>
  );
}

/** Employees by a key, in the order each key first appears. */
function groupBy(employees: Employee[], key: (employee: Employee) => string) {
  const groups = new Map<string, Employee[]>();
  employees.forEach((employee) =>
    groups.set(key(employee), [...(groups.get(key(employee)) ?? []), employee]),
  );
  return [...groups];
}

/** The sections a view shows, as [title, employees]. Org puts each lead before its reports. */
function sectionsFor(view: View, shown: Employee[], every: Employee[]): [string, Employee[]][] {
  if (view === "cards") return groupBy(shown, (employee) => employee.group);
  if (view === "teams") return groupBy(shown, (employee) => employee.pipeline);
  return every
    .filter((employee) => employee.reports_to === null)
    .map((lead) => [
      `${lead.name} · ${lead.title}`,
      shown.filter((e) => e.id === lead.id || e.reports_to === lead.id),
    ]);
}

interface Filters {
  department: string;
  pipeline: string;
  status: string;
}

/** The chosen view's sections of employee cards. */
function Employees({
  view,
  employees,
  filters,
  onOpen,
}: {
  view: View;
  employees: Employee[];
  filters: Filters;
  onOpen: (id: string) => void;
}) {
  const shown = employees.filter(
    (e) =>
      (filters.department === ALL || e.department === filters.department) &&
      (filters.pipeline === ALL || e.pipeline === filters.pipeline) &&
      (filters.status === ALL || e.status === filters.status),
  );
  const sections = sectionsFor(view, shown, employees);
  return (
    <Reflow>
      {shown.length === 0 && (
        <ReflowItem key="empty">
          <p className="card empty">No one matches these filters.</p>
        </ReflowItem>
      )}
      {sections
        .filter(([, group]) => group.length > 0)
        .map(([title, group]) => (
          <ReflowItem key={title}>
            <Section title={title} aside={view === "cards" ? undefined : `${group.length}`}>
              <div className="card-grid">
                {group.map((employee) => (
                  <EmployeeCard
                    key={employee.id}
                    employee={employee}
                    onOpen={() => onOpen(employee.id)}
                  />
                ))}
              </div>
            </Section>
          </ReflowItem>
        ))}
    </Reflow>
  );
}

/** Department, pipeline and status pills. */
function FilterBar({
  filters,
  pipelines,
  onChange,
}: {
  filters: Filters;
  pipelines: string[];
  onChange: (key: keyof Filters, value: string) => void;
}) {
  const statuses = Object.entries(EMPLOYEE_STATUS).map(([s, words]) => [s, words.label] as const);
  return (
    <div className="row wrap filter-bar" role="group" aria-label="Filters">
      <FilterMenu
        label="Department"
        value={filters.department}
        options={DEPARTMENTS}
        onChange={(value) => onChange("department", value)}
      />
      <FilterMenu
        label="Pipeline"
        value={filters.pipeline}
        options={pipelines.map((p) => [p, p] as const)}
        onChange={(value) => onChange("pipeline", value)}
      />
      <FilterMenu
        label="Status"
        value={filters.status}
        options={statuses}
        onChange={(value) => onChange("status", value)}
      />
    </div>
  );
}

/** The view and filters, read from and written to the URL. */
function useDirectoryParams() {
  const [params, setParams] = useSearchParams();
  const asked = params.get("view");
  const view: View = asked === "teams" || asked === "org" ? asked : "cards";
  const filters: Filters = {
    department: params.get("department") ?? ALL,
    pipeline: params.get("pipeline") ?? ALL,
    status: params.get("status") ?? ALL,
  };
  const write = (nextView: View, next: Filters) => {
    const out: Record<string, string> = nextView === "cards" ? {} : { view: nextView };
    (Object.keys(next) as (keyof Filters)[]).forEach((key) => {
      if (next[key] !== ALL) out[key] = next[key];
    });
    setParams(out);
  };
  return { view, filters, write };
}

/** The Directory page. */
export default function Directory() {
  const query = useDirectory();
  const [openId, setOpenId] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const { view, filters, write } = useDirectoryParams();
  return (
    <QueryState query={query}>
      {(directory) => {
        const chosen = directory.employees.find((employee) => employee.id === openId);
        const pipelines = [...new Set(directory.employees.map((e) => e.pipeline))];
        return (
          <Page
            title="Directory"
            subtitle={`${directory.employees.length} employees · ${directory.instruments} instruments`}
            actions={
              <button type="button" className="btn" onClick={() => setSuggesting(true)}>
                <UserPlus size={18} aria-hidden="true" />
                Suggest a role
              </button>
            }
          >
            <Proposals directory={directory} />
            <Segmented
              label="View"
              options={VIEWS}
              value={view}
              onChange={(next) => write(next, filters)}
            />
            <FilterBar
              filters={filters}
              pipelines={pipelines}
              onChange={(key, value) => write(view, { ...filters, [key]: value })}
            />
            <Swap id={view}>
              <Employees
                view={view}
                employees={directory.employees}
                filters={filters}
                onOpen={setOpenId}
              />
            </Swap>
            <Sheet
              open={chosen !== undefined}
              title={chosen?.name ?? ""}
              onClose={() => setOpenId(null)}
            >
              {chosen && <Profile employee={chosen} />}
            </Sheet>
            <SuggestRole open={suggesting} onClose={() => setSuggesting(false)} />
          </Page>
        );
      }}
    </QueryState>
  );
}
