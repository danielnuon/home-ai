/**
 * @file The one panel for an optional paid feature (spec 7.16, rule 2), wherever it appears:
 * what it does, its switch, its cap with the policy ceiling, and its impact preview.
 */
import { useSettings } from "../api/queries";
import type { PaidFeature } from "../api/types";
import { ImpactCard } from "./ImpactCard";
import { SettingRow } from "./SettingControl";

/** A paid feature with its on switch and monthly cap. */
export function PaidFeatureCard({ feature }: { feature: PaidFeature }) {
  const settings = useSettings().data?.settings ?? [];
  const controls = [feature.setting_key, feature.cap_setting_key]
    .map((key) => settings.find((setting) => setting.key === key))
    .filter((setting) => setting !== undefined);
  return (
    <article className="card stack" aria-label={feature.name}>
      <div className="row">
        <div className="grow">
          <h3>{feature.name}</h3>
          <p className="muted small">{feature.meta}</p>
        </div>
        <span className={`tag ${feature.on ? "info" : ""}`}>{feature.on ? "On" : "Off"}</span>
      </div>
      <div className="list">
        {controls.map((setting) => (
          <SettingRow key={setting.key} setting={setting} />
        ))}
      </div>
      <ImpactCard lines={feature.impact} />
    </article>
  );
}
