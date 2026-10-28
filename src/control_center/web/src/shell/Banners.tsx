/**
 * @file Global states shown on every page (spec 7.16, rule 6), each with its way out.
 *
 * One calm banner per state, never flashing (7.12, "Status"): stopped, away mode, a degraded mode
 * or quiet hours.
 */
import { Link } from "react-router-dom";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { usePlatform } from "../api/queries";

/** The banners for whatever global states are active right now. */
export function Banners() {
  const platform = usePlatform().data;
  const action = useAction({ refresh: ["platform"] });
  if (!platform) return null;

  const resume = () => action.run((proof) => send("POST", "/platform/resume", undefined, proof));
  const leaveAway = () =>
    action.run((proof) => send("PUT", "/settings/away_mode", { value: "off" }, proof));

  return (
    <div className="banners">
      {platform.stopped && (
        <div className="banner problem" role="status">
          <span className="grow">
            ■ Everything is stopped. Nothing runs or leaves the house until you resume.
          </span>
          <button type="button" className="btn compact" disabled={action.busy} onClick={resume}>
            Resume
          </button>
        </div>
      )}
      {platform.away && (
        <div className="banner attention" role="status">
          <span className="grow">
            ▲ Away mode. Pipelines are paused; reminders and backups keep running.
          </span>
          <button type="button" className="btn compact" disabled={action.busy} onClick={leaveAway}>
            I'm back
          </button>
        </div>
      )}
      {platform.degraded.map((mode) => (
        <div key={mode} className="banner attention" role="status">
          <span className="grow">▲ {mode}</span>
          <Link to="/system" className="btn compact">
            See System
          </Link>
        </div>
      ))}
      {platform.quiet_hours && (
        <div className="banner info" role="status">
          <span className="grow">◐ Quiet hours. Alerts are held until morning.</span>
          <Link to="/schedule" className="btn compact">
            Schedule
          </Link>
        </div>
      )}
    </div>
  );
}
