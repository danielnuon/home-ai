/**
 * @file Voice: who reads approval calls aloud (design: Voice). Cloned voices need recorded
 * consent; private celebrity clones stay off unless the Owner accepts the risk.
 */
import { useSettings, useVoice } from "../api/queries";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { SettingRow } from "../components/SettingControl";

const VOICE_KEYS = ["voice.enabled", "voice.profile", "voice.profiles.celebrity_clones"];

/** The Voice page. */
export default function Voice() {
  const query = useVoice();
  const settings = (useSettings().data?.settings ?? []).filter((s) => VOICE_KEYS.includes(s.key));
  return (
    <Page
      title="Voice"
      subtitle="Approval calls read your request aloud and take a spoken yes or no."
    >
      <div className="list">
        {settings.map((setting) => (
          <SettingRow key={setting.key} setting={setting} />
        ))}
      </div>
      <QueryState query={query}>
        {(voice) => (
          <>
            <Section title="Voices">
              <ul className="list">
                {voice.profiles.map((profile) => (
                  <li key={profile.id} className="list-row">
                    <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
                      <span className="row-title">
                        {profile.name}{" "}
                        {profile.selected && <span className="tag healthy">in use</span>}
                      </span>
                      <span className="muted small">{profile.meta}</span>
                    </span>
                    {profile.locked && <span className="tag">locked</span>}
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="What a call sounds like">
              <blockquote className="card draft">{voice.script}</blockquote>
            </Section>
          </>
        )}
      </QueryState>
    </Page>
  );
}
