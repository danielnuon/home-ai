/**
 * @file The Voice page's sheets and preview: a profile's details, adding a voice, and the preview
 * that lights each script line as its clip plays (spec 11.5.1).
 */
import { Check, Mic, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAction } from "../../api/actions";
import { send } from "../../api/client";
import type { VoiceOverview, VoicePreview, VoiceProfile } from "../../api/types";
import { Segmented } from "../../components/Controls";
import { HoldButton } from "../../components/HoldButton";
import { Sheet } from "../../components/Sheet";
import { m } from "../../design/motion";

/** The actions on a profile, shared by its row, its "…" menu and its sheet. */
export interface ProfileActions {
  use: (profile: VoiceProfile) => void;
  preview: (profile: VoiceProfile) => void;
  render: (profile: VoiceProfile) => void;
  remove: (profile: VoiceProfile) => void;
}

/** Each profile type's badge: its words and its tag colour. */
export const KIND_TAG: Record<VoiceProfile["kind"], [string, string]> = {
  default: ["Twilio default", ""],
  stock: ["Stock", "info"],
  consented_clone: ["Consented clone", "healthy"],
  celebrity_clone: ["Celebrity clone", "attention"],
};

const LINE_MS = 1400;
const GAP = { ["--gap" as string]: "var(--space-2)" };

/** "4 clips · rendered Oct 25, 14:05", or why there are none. */
function clipsNote(profile: VoiceProfile): string {
  if (profile.kind === "default") return "No local clips · Twilio reads the script live";
  if (!profile.rendered_at) return "Not rendered yet";
  const at = new Date(profile.rendered_at).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${profile.clips} clips · rendered ${at}`;
}

/** The preview: each script line lights in turn, as its clip would play. */
export function PreviewPanel({ preview, onDone }: { preview: VoicePreview; onDone: () => void }) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    if (line >= preview.lines.length) {
      onDone();
      return;
    }
    const timer = window.setTimeout(() => setLine(line + 1), LINE_MS);
    return () => window.clearTimeout(timer);
  }, [line, preview.lines.length, onDone]);
  return (
    <m.div
      className="card stack"
      role="status"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
    >
      <p className="muted small">{preview.message}</p>
      <ol className="list">
        {preview.lines.map((text, index) => (
          <li
            key={text}
            className="list-row small"
            style={{ opacity: index === line ? 1 : 0.45, transition: "opacity 240ms ease" }}
          >
            {text}
          </li>
        ))}
      </ol>
    </m.div>
  );
}

/** A profile's facts: engine, consent or risk record, sample and clips. */
function ProfileFacts({ profile }: { profile: VoiceProfile }) {
  const facts: [string, string | null][] = [
    ["Engine", profile.engine],
    [profile.kind === "celebrity_clone" ? "Risk" : "Consent", profile.record],
    ["Sample", profile.sample],
    ["Clips", clipsNote(profile)],
  ];
  return (
    <dl className="list facts">
      {facts
        .filter((fact): fact is [string, string] => Boolean(fact[1]))
        .map(([name, value]) => (
          <div key={name} className="list-row">
            <dt className="grow">{name}</dt>
            <dd className="muted">{value}</dd>
          </div>
        ))}
    </dl>
  );
}

/** The badges at the top of a profile's sheet. */
function ProfileTags({ profile }: { profile: VoiceProfile }) {
  const [tag, tone] = KIND_TAG[profile.kind];
  return (
    <div className="row wrap" style={GAP}>
      <span className={`tag ${tone}`}>{tag}</span>
      {profile.selected && <span className="tag healthy">Call voice</span>}
      {profile.locked && <span className="tag">Locked · setting off</span>}
    </div>
  );
}

interface ButtonsProps {
  profile: VoiceProfile;
  actions: ProfileActions;
  onDelete: () => void;
  onClose: () => void;
}

/** Every action the profile offers, as buttons. */
function ProfileButtons({ profile, actions, onDelete, onClose }: ButtonsProps) {
  const local = profile.kind !== "default" && !profile.locked;
  const then = (act: () => void) => () => {
    act();
    onClose();
  };
  return (
    <div className="row wrap" style={GAP}>
      {!profile.selected && !profile.locked && (
        <button type="button" className="btn primary" onClick={then(() => actions.use(profile))}>
          <Check size={16} aria-hidden="true" /> Use for calls
        </button>
      )}
      {local && (
        <button type="button" className="btn" onClick={then(() => actions.preview(profile))}>
          <Play size={16} aria-hidden="true" /> Preview
        </button>
      )}
      {local && (
        <button type="button" className="btn" onClick={() => actions.render(profile)}>
          <RefreshCw size={16} aria-hidden="true" /> Re-render
        </button>
      )}
      {profile.kind !== "default" && (
        <button type="button" className="btn destructive" onClick={onDelete}>
          <Trash2 size={16} aria-hidden="true" /> Delete…
        </button>
      )}
    </div>
  );
}

/** What deleting takes with it, then the hold that does it. */
function DeleteConfirm({ profile, onConfirm }: { profile: VoiceProfile; onConfirm: () => void }) {
  return (
    <div className="stack">
      <p>
        Deleting {profile.name} removes its sample, its {profile.clips} clips and its copies on
        Twilio.{profile.selected && " Calls go back to Twilio's own voice."}
      </p>
      <HoldButton label="Delete voice" onConfirm={onConfirm} />
    </div>
  );
}

interface ProfileSheetProps {
  profile: VoiceProfile | null;
  actions: ProfileActions;
  onClose: () => void;
}

/** One profile's details and actions, opened by pressing its row. */
export function ProfileSheet({ profile, actions, onClose }: ProfileSheetProps) {
  const [deleting, setDeleting] = useState(false);
  const close = () => {
    setDeleting(false);
    onClose();
  };
  return (
    <Sheet open={profile !== null} title={profile?.name ?? ""} onClose={close}>
      {profile && (
        <div className="stack">
          <ProfileTags profile={profile} />
          <ProfileFacts profile={profile} />
          {deleting ? (
            <DeleteConfirm
              profile={profile}
              onConfirm={() => {
                actions.remove(profile);
                close();
              }}
            />
          ) : (
            <ProfileButtons
              profile={profile}
              actions={actions}
              onDelete={() => setDeleting(true)}
              onClose={close}
            />
          )}
        </div>
      )}
    </Sheet>
  );
}

type AddKind = "stock" | "consented_clone" | "celebrity_clone";
type AddBody = Record<string, unknown>;

/** The stock voices not yet added, each added in one tap. */
function StockList({
  voice,
  busy,
  add,
}: {
  voice: VoiceOverview;
  busy: boolean;
  add: (b: AddBody) => void;
}) {
  if (voice.stock_voices.length === 0) {
    return <p className="list empty">Every stock voice is already a profile.</p>;
  }
  return (
    <div className="list">
      {voice.stock_voices.map((stock) => (
        <div key={stock.id} className="list-row">
          <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
            <span className="row-title">{stock.name}</span>
            <span className="muted small">{stock.note} · free</span>
          </span>
          <button
            type="button"
            className="btn compact"
            disabled={busy}
            onClick={() => add({ kind: "stock", stock_id: stock.id })}
          >
            <Plus size={16} aria-hidden="true" /> Add
          </button>
        </div>
      ))}
    </div>
  );
}

/** Record here or upload a file; the sample never leaves the Mac. */
function SampleField({ sample, onChange }: { sample: string; onChange: (s: string) => void }) {
  return (
    <div className="row wrap" style={GAP}>
      <button
        type="button"
        className="btn compact"
        onClick={() => onChange("Recorded in Brain · 20 s")}
      >
        <Mic size={16} aria-hidden="true" /> Record 20 s
      </button>
      <label className="btn compact">
        Upload
        <input
          type="file"
          accept="audio/*"
          className="visually-hidden"
          onChange={(event) => onChange(event.target.files?.[0]?.name ?? "")}
        />
      </label>
      <span className="muted small grow">{sample || "No sample yet"}</span>
    </div>
  );
}

interface CloneFormProps {
  kind: Exclude<AddKind, "stock">;
  voice: VoiceOverview;
  busy: boolean;
  add: (body: AddBody) => void;
}

/** A clone: its name, a sample, and how its owner agreed or the risk notice. */
function CloneForm({ kind, voice, busy, add }: CloneFormProps) {
  const [name, setName] = useState("");
  const [sample, setSample] = useState("");
  const [consent, setConsent] = useState("");
  const [risk, setRisk] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    add({ kind, name, sample, consent, risk_acknowledged: risk });
  };
  const celebrity = kind === "celebrity_clone";
  return (
    <form className="stack" onSubmit={submit}>
      {celebrity && !voice.celebrity_clones && (
        <p className="card attention small">
          Turn on Private celebrity clones on this page first. It stays off unless you accept the
          risk.
        </p>
      )}
      <input
        className="field"
        aria-label="Voice name"
        placeholder="Name, such as Grandma"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <SampleField sample={sample} onChange={setSample} />
      {celebrity ? (
        <label className="row small">
          <input type="checkbox" checked={risk} onChange={(e) => setRisk(e.target.checked)} />
          <span className="grow">{voice.risk_notice}</span>
        </label>
      ) : (
        <input
          className="field"
          aria-label="How they agreed"
          placeholder="How they agreed, such as in person on Oct 24"
          value={consent}
          onChange={(event) => setConsent(event.target.value)}
        />
      )}
      <button type="submit" className="btn primary sheet-action" disabled={busy}>
        Add clone
      </button>
      <p className="muted tiny">Adding a clone needs your passkey. Samples never leave the Mac.</p>
    </form>
  );
}

interface AddSheetProps {
  open: boolean;
  voice: VoiceOverview;
  onClose: () => void;
}

/** Add a stock voice in one tap, or a clone from a sample with its consent or risk record. */
export function AddVoiceSheet({ open, voice, onClose }: AddSheetProps) {
  const [kind, setKind] = useState<AddKind>("stock");
  const { run, busy } = useAction<VoiceProfile>({
    refresh: ["voice", "settings"],
    done: (made) => `${made.name} added and rendered`,
  });
  const add = (body: AddBody) =>
    void run((proof) => send<VoiceProfile>("POST", "/voice/profiles", body, proof)).then((made) => {
      if (made) onClose();
    });
  return (
    <Sheet open={open} title="Add a voice" onClose={onClose}>
      <div className="stack">
        <Segmented
          label="Kind of voice"
          value={kind}
          options={[
            { value: "stock", label: "Stock" },
            { value: "consented_clone", label: "Clone" },
            { value: "celebrity_clone", label: "Celebrity" },
          ]}
          onChange={setKind}
        />
        {kind === "stock" ? (
          <StockList voice={voice} busy={busy} add={add} />
        ) : (
          <CloneForm key={kind} kind={kind} voice={voice} busy={busy} add={add} />
        )}
      </div>
    </Sheet>
  );
}
