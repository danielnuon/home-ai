/**
 * @file Settings: an index of every setting, each changeable here and on the page that owns it
 * (spec 7.16, rule 7; design: More and settings).
 *
 * On a phone this page is also "More": the bottom bar only fits five tabs, so the remaining pages
 * are listed above the settings.
 */
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { usePlatform, useSettings } from "../api/queries";
import type { Setting, StatusLabel } from "../api/types";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { SettingControl } from "../components/SettingControl";
import { useLayout } from "../design/useLayout";
import { ROUTES, TAB_PATHS } from "../routes";
import { StopControl } from "../shell/StopControl";

/** Every page that is not on the phone's bottom bar. */
function MorePages() {
  const badges = (usePlatform().data?.badges ?? {}) as Record<string, StatusLabel>;
  const pages = ROUTES.filter((page) => page.inNav && !TAB_PATHS.includes(page.path));
  return (
    <Section title="More">
      <div className="card">
        <StopControl />
      </div>
      <nav className="list" aria-label="More pages">
        {pages.map((page) => {
          const badge = page.badge ? badges[page.badge] : undefined;
          return (
            <Link key={page.path} to={page.path} className="list-row">
              <page.icon size={18} aria-hidden="true" />
              <span className="grow">{page.label}</span>
              {badge && <span className={`small status-${badge.status}`}>{badge.label}</span>}
              <ChevronRight size={16} className="muted" aria-hidden="true" />
            </Link>
          );
        })}
      </nav>
    </Section>
  );
}

/** Settings grouped by category, in the order they first appear. */
function byCategory(settings: Setting[]): [string, Setting[]][] {
  const groups = new Map<string, Setting[]>();
  settings.forEach((setting) =>
    groups.set(setting.category, [...(groups.get(setting.category) ?? []), setting]),
  );
  return [...groups];
}

/** One setting with a link to its owner page. */
function IndexRow({ setting }: { setting: Setting }) {
  const owner = ROUTES.find((page) => page.path === `/${setting.owner_page}`);
  return (
    <div className="list-row setting-row">
      <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
        <span className="row-title">{setting.label}</span>
        <span className="muted small">
          {setting.note}
          {owner && owner.path !== "/settings" && (
            <>
              {" · "}
              <Link to={owner.path}>{owner.label}</Link>
            </>
          )}
        </span>
      </span>
      <SettingControl setting={setting} />
    </div>
  );
}

/** The Settings page. */
export default function Settings() {
  const layout = useLayout();
  const query = useSettings();
  const [filter, setFilter] = useState("");
  const matches = (setting: Setting) =>
    `${setting.label} ${setting.note} ${setting.category}`
      .toLowerCase()
      .includes(filter.trim().toLowerCase());

  return (
    <Page title={layout === "phone" ? "More and settings" : "Settings"}>
      {layout === "phone" && <MorePages />}
      <QueryState query={query}>
        {(index) => (
          <>
            <input
              className="field"
              type="search"
              aria-label="Find a setting"
              placeholder="Find a setting"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
            {byCategory(index.settings.filter(matches)).map(([category, settings]) => (
              <Section key={category} title={category}>
                <div className="list">
                  {settings.map((setting) => (
                    <IndexRow key={setting.key} setting={setting} />
                  ))}
                </div>
              </Section>
            ))}
            <Section title="Hard limits" aside="From policy.yaml; change only at the desk">
              <dl className="list facts">
                {index.hard_limits.map((limit) => (
                  <div key={limit.name} className="list-row">
                    <dt className="grow">{limit.name}</dt>
                    <dd className="muted">{limit.value}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          </>
        )}
      </QueryState>
    </Page>
  );
}
