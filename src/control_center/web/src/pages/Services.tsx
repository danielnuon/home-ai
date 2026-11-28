/**
 * @file Services: every background service, Restart, and its full logs (design: Services; spec
 * 7.2). Pressing a service opens its logs; swipe right for the logs and left to restart, or use
 * the same two from the "…" menu.
 */
import { RotateCw, ScrollText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useServices } from "../api/queries";
import type { ServiceRow } from "../api/types";
import { ActionRow } from "../components/ActionRow";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";

/** Restart, behind a passkey; the same in the row, the menu and the logs page. */
export function useRestart(service: Pick<ServiceRow, "id" | "name">) {
  const restart = useAction<unknown>({
    refresh: ["services"],
    done: () => `Restarting ${service.name}`,
  });
  return () =>
    void restart.run((proof) => send("POST", `/services/${service.id}/restart`, undefined, proof));
}

/** One service: its status and the line under it, opening its logs. */
function Service({ service }: { service: ServiceRow }) {
  const navigate = useNavigate();
  const restart = useRestart(service);
  const logs = {
    label: "Logs",
    icon: ScrollText,
    onSelect: () => void navigate(`/services/${service.id}`),
  };
  const again = service.restartable
    ? { label: "Restart", icon: RotateCw, tone: "sand" as const, onSelect: restart }
    : undefined;
  return (
    <ActionRow
      title={service.name}
      meta={service.meta}
      status={service.status}
      href={`/services/${service.id}`}
      start={logs}
      end={again}
      more={again ? [logs, again] : [logs]}
    />
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
