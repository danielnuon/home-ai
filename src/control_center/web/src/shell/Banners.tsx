/**
 * @file Global states shown on every page (spec 7.16, rule 6), each with its way out.
 *
 * One calm banner per state, never flashing (7.12, "Status"): stopped, away mode, a degraded mode
 * or quiet hours.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { usePlatform } from "../api/queries";
import { Reflow, ReflowItem } from "../components/Reflow";

/** One banner: what is going on, and its way out. */
function Banner({
  tone,
  children,
  action,
}: {
  tone: string;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className={`banner ${tone}`} role="status">
      <span className="grow">{children}</span>
      {action}
    </div>
  );
}

/** A banner's way out that is another page. */
function GoTo({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="btn compact">
      {label}
    </Link>
  );
}

/** The banners for whatever global states are active right now; each one slides in and out. */
export function Banners() {
  const platform = usePlatform().data;
  const action = useAction({ refresh: ["platform"] });
  if (!platform) return null;

  const resume = () => action.run((proof) => send("POST", "/platform/resume", undefined, proof));
  const leaveAway = () =>
    action.run((proof) => send("PUT", "/settings/away_mode", { value: "off" }, proof));
  const button = (label: string, onClick: () => void) => (
    <button type="button" className="btn compact" disabled={action.busy} onClick={onClick}>
      {label}
    </button>
  );

  return (
    <div className="banners">
      <Reflow>
        {platform.stopped && (
          <ReflowItem key="stopped">
            <Banner tone="problem" action={button("Resume", resume)}>
              ■ Everything is stopped. Nothing runs or leaves the house until you resume.
            </Banner>
          </ReflowItem>
        )}
        {platform.away && (
          <ReflowItem key="away">
            <Banner tone="attention" action={button("I'm back", leaveAway)}>
              ▲ Away mode. Pipelines are paused; reminders and backups keep running.
            </Banner>
          </ReflowItem>
        )}
        {platform.degraded.map((mode) => (
          <ReflowItem key={mode}>
            <Banner tone="attention" action={<GoTo to="/system" label="See System" />}>
              ▲ {mode}
            </Banner>
          </ReflowItem>
        ))}
        {platform.quiet_hours && (
          <ReflowItem key="quiet">
            <Banner tone="info" action={<GoTo to="/schedule" label="Schedule" />}>
              ◐ Quiet hours. Alerts are held until morning.
            </Banner>
          </ReflowItem>
        )}
      </Reflow>
    </div>
  );
}
