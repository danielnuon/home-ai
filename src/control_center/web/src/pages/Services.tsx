/**
 * @file Services: every background service, its recent log, and Restart (design: Services).
 */
import { useState } from "react";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useServices } from "../api/queries";
import type { ServiceRow } from "../api/types";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { StatusText } from "../design/status";

/** One service; tapping it shows its last log lines. */
function Service({ service }: { service: ServiceRow }) {
  const [open, setOpen] = useState(false);
  const restart = useAction<unknown>({
    refresh: ["services"],
    done: () => `Restarting ${service.name}`,
  });
  return (
    <div className="service">
      <button
        type="button"
        className="list-row"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
          <span className="row-title">{service.name}</span>
          <span className="muted small">{service.meta}</span>
        </span>
        <StatusText value={service.status} className="small" />
      </button>
      {open && (
        <div className="service-detail stack">
          <pre className="log mono tiny">
            {service.log_lines.join("\n") || "No recent log lines."}
          </pre>
          {service.restartable && (
            <button
              type="button"
              className="btn compact"
              disabled={restart.busy}
              onClick={() =>
                restart.run((proof) =>
                  send("POST", `/services/${service.id}/restart`, undefined, proof),
                )
              }
            >
              Restart
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** The Services page. */
export default function Services() {
  const query = useServices();
  return (
    <QueryState query={query}>
      {(overview) => (
        <Page title="Services" subtitle={overview.summary}>
          {overview.groups.map((group) => (
            <Section key={group.name} title={group.name}>
              <div className="list">
                {group.services.map((service) => (
                  <Service key={service.id} service={service} />
                ))}
              </div>
            </Section>
          ))}
        </Page>
      )}
    </QueryState>
  );
}
