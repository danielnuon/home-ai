/**
 * @file Directory: every employee, its profile, and lifecycle proposals (design: Directory;
 * spec 7.16, "Employee and lifecycle proposal").
 *
 * Disabling an employee tightens and takes one tap; enabling one loosens and asks for the passkey.
 */
import { useState } from "react";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useDirectory } from "../api/queries";
import type { Directory as DirectoryData, Employee } from "../api/types";
import { Avatar } from "../components/Avatar";
import { Switch } from "../components/Controls";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { Sheet } from "../components/Sheet";

/** The profile sheet's body. */
function Profile({ employee }: { employee: Employee }) {
  const toggle = useAction<unknown>({
    refresh: ["directory"],
    done: () => `${employee.name} is ${employee.enabled ? "off" : "on"}`,
  });
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
        <dt>Now</dt>
        <dd>{employee.now}</dd>
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
            disabled={toggle.busy}
            onChange={(enabled) =>
              toggle.run((proof) =>
                send("PUT", `/directory/${employee.id}/enabled`, { enabled }, proof),
              )
            }
          />
        </div>
      </div>
    </div>
  );
}

/** Open lifecycle proposals: hire, retire or change an employee. */
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

/** Employees by group. */
function groupEmployees(employees: Employee[]): [string, Employee[]][] {
  const groups = new Map<string, Employee[]>();
  employees.forEach((employee) =>
    groups.set(employee.group, [...(groups.get(employee.group) ?? []), employee]),
  );
  return [...groups];
}

/** The Directory page. */
export default function Directory() {
  const query = useDirectory();
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <QueryState query={query}>
      {(directory) => {
        const chosen = directory.employees.find((employee) => employee.id === openId);
        return (
          <Page
            title="Directory"
            subtitle={`${directory.employees.length} employees · ${directory.instruments} instruments`}
          >
            <Proposals directory={directory} />
            {groupEmployees(directory.employees).map(([group, employees]) => (
              <Section key={group} title={group}>
                <div className="card-grid">
                  {employees.map((employee) => (
                    <button
                      key={employee.id}
                      type="button"
                      className="card row interactive employee"
                      onClick={() => setOpenId(employee.id)}
                    >
                      <Avatar
                        department={employee.department}
                        state={employee.state}
                        name={employee.name}
                      />
                      <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
                        <span className="row-title">
                          {employee.name}
                          {!employee.enabled && <span className="tag"> off</span>}
                        </span>
                        <span className="muted small">{employee.title}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </Section>
            ))}
            <Sheet
              open={chosen !== undefined}
              title={chosen?.name ?? ""}
              onClose={() => setOpenId(null)}
            >
              {chosen && <Profile employee={chosen} />}
            </Sheet>
          </Page>
        );
      }}
    </QueryState>
  );
}
