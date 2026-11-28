/**
 * @file Voice: who reads approval calls aloud (spec 7.2, 11.5.1; design: Voice).
 *
 * Every profile shows its type, engine, consent or risk record and its clips. Choosing one, adding
 * a stock voice, re-rendering and previewing take one tap; a clone needs a sample, its consent or
 * risk record, and the passkey. Previews play here only, from the clips on the Mac. Deleting a
 * profile destroys its sample and clips with it, so it is a hold that says it can't be undone.
 */
import { Check, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useSettings, useVoice } from "../api/queries";
import { useChangeSetting } from "../api/settings";
import type { Setting, VoicePreview, VoiceProfile } from "../api/types";
import { ActionRow } from "../components/ActionRow";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { SettingRow } from "../components/SettingControl";
import { AnimatePresence, LEAVE, m } from "../design/motion";
import {
  AddVoiceSheet,
  KIND_TAG,
  PreviewPanel,
  ProfileSheet,
  type ProfileActions,
} from "./voice/parts";

const VOICE_KEYS = ["voice.enabled", "voice.profile", "voice.profiles.celebrity_clones"];
const REFRESH = ["voice", "settings"];

const post = <Result,>(profile: VoiceProfile, verb: string) =>
  send<Result>("POST", `/voice/profiles/${profile.id}/${verb}`);

/** Every profile action, each a one-tap request through the gate. */
function useProfileActions(callVoice: Setting | undefined, onPreview: (p: VoicePreview) => void) {
  const fallback = callVoice ?? ({ key: "voice.profile", owner_page: "voice" } as Setting);
  const { change } = useChangeSetting(fallback);
  const previewer = useAction<VoicePreview>();
  const renderer = useAction<VoiceProfile>({
    refresh: REFRESH,
    done: (p) => `${p.name} re-rendered`,
  });
  const deleter = useAction<null>({
    refresh: REFRESH,
    done: () => "Voice deleted with its sample and clips",
  });
  const actions: ProfileActions = {
    use: (profile) => void change(profile.id),
    preview: (profile) =>
      void previewer
        .run(() => post<VoicePreview>(profile, "preview"))
        .then((found) => {
          if (found) onPreview(found);
        }),
    render: (profile) => void renderer.run(() => post<VoiceProfile>(profile, "render")),
    remove: (profile) => void deleter.run(() => post<null>(profile, "delete")),
  };
  return actions;
}

/** A profile row: swipe right to use it for calls, left to preview it. */
function ProfileRow({
  profile,
  actions,
  onOpen,
}: {
  profile: VoiceProfile;
  actions: ProfileActions;
  onOpen: () => void;
}) {
  const [tag] = KIND_TAG[profile.kind];
  const usable = !profile.selected && !profile.locked;
  const local = profile.kind !== "default" && !profile.locked;
  const use = { label: "Use for calls", icon: Check, onSelect: () => actions.use(profile) };
  const listen = {
    label: "Preview",
    icon: Play,
    tone: "sand" as const,
    onSelect: () => actions.preview(profile),
  };
  const rerender = { label: "Re-render", icon: RefreshCw, onSelect: () => actions.render(profile) };
  const remove = { label: "Delete…", icon: Trash2, destructive: true, onSelect: onOpen };
  const more = [
    ...(usable ? [use] : []),
    ...(local ? [listen, rerender] : []),
    ...(profile.kind !== "default" ? [remove] : []),
  ];
  const status = profile.selected
    ? ({ status: "healthy", label: "Call voice" } as const)
    : profile.locked
      ? ({ status: "neutral", label: "Locked" } as const)
      : null;
  return (
    <ActionRow
      title={profile.name}
      meta={`${tag} · ${profile.meta}`}
      status={status}
      onOpen={onOpen}
      start={usable ? use : undefined}
      end={local ? listen : undefined}
      more={more}
    />
  );
}

/** Every profile as a row that slides into place when it is added or deleted. */
function VoiceList({
  profiles,
  actions,
  onOpen,
}: {
  profiles: VoiceProfile[];
  actions: ProfileActions;
  onOpen: (id: string) => void;
}) {
  return (
    <Section title="Voices">
      <div className="list">
        <AnimatePresence initial={false} mode="popLayout">
          {profiles.map((profile) => (
            <m.div key={profile.id} layout="position" exit={LEAVE}>
              <ProfileRow profile={profile} actions={actions} onOpen={() => onOpen(profile.id)} />
            </m.div>
          ))}
        </AnimatePresence>
      </div>
    </Section>
  );
}

/** The Voice page. */
export default function Voice() {
  const query = useVoice();
  const settings = (useSettings().data?.settings ?? []).filter((s) => VOICE_KEYS.includes(s.key));
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState<VoicePreview | null>(null);
  const actions = useProfileActions(
    settings.find((s) => s.key === "voice.profile"),
    setPreview,
  );
  const addButton = (
    <button type="button" className="btn compact" onClick={() => setAdding(true)}>
      <Plus size={16} aria-hidden="true" /> Add a voice
    </button>
  );
  return (
    <Page
      title="Voice"
      subtitle="Approval calls read your request aloud and take a spoken yes or no."
      actions={addButton}
    >
      <div className="list">
        {settings.map((setting) => (
          <SettingRow key={setting.key} setting={setting} />
        ))}
      </div>
      <AnimatePresence initial={false}>
        {preview && (
          <PreviewPanel
            key={preview.profile_id}
            preview={preview}
            onDone={() => setPreview(null)}
          />
        )}
      </AnimatePresence>
      <QueryState query={query}>
        {(voice) => (
          <>
            <VoiceList profiles={voice.profiles} actions={actions} onOpen={setOpenId} />
            <Section title="What a call sounds like">
              <blockquote className="card draft">{voice.script}</blockquote>
            </Section>
            <ProfileSheet
              profile={voice.profiles.find((p) => p.id === openId) ?? null}
              actions={actions}
              onClose={() => setOpenId(null)}
            />
            <AddVoiceSheet open={adding} voice={voice} onClose={() => setAdding(false)} />
          </>
        )}
      </QueryState>
    </Page>
  );
}
