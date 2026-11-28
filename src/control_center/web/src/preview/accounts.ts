/**
 * @file The preview's accounts, security and money: Connections, Voice, Security, data export,
 * impact previews and predicted versus actual. A port of `backends/mock/gate_accounts.py`,
 * `backends/mock/engine_accounts.py` and the matching reads in `backends/mock/status.py`.
 */
import type { components } from "../api/schema";
import { conflict, notFound } from "./errors";
import { requireStepUp, validate } from "./gate";
import { isOn, setting, type MockWorld } from "./world";

type Schemas = components["schemas"];
type Connection = Schemas["Connection"];
type ConnectionResult = Schemas["ConnectionResult"];
type VoiceProfile = Schemas["VoiceProfile"];
type ImpactLine = Schemas["ImpactLine"];
type StatusLabel = Schemas["StatusLabel"];

const CONNECTION_PAGES = ["connections", "today"];
const VOICE_PAGES = ["voice", "settings"];
const SECURITY_PAGES = ["security"];
const VOICE_SETTING = "voice.profile";
const DEFAULT_VOICE = "twilio_default";
const KOKORO = "Kokoro-82M";
const CHATTERBOX = "Chatterbox";
const RECOVERY_CODE_COUNT = 8;
const EXPORT_SCOPES: Record<string, string> = {
  all: "all data",
  owner: "your data",
  mom: "Mom's data",
  dad: "Dad's data",
};
const PERMISSION_WORDS: Record<string, StatusLabel> = {
  allowed: { status: "healthy", label: "Allowed" },
  waiting: { status: "attention", label: "Waiting" },
  denied: { status: "problem", label: "Denied" },
  off: { status: "neutral", label: "Off" },
};

// Reads ----------------------------------------------------------------------------------------

/** Connections grouped by kind, in page order. */
export function connections(world: MockWorld): Schemas["ConnectionsOverview"] {
  const every = Object.values(world.accounts.connections);
  return {
    groups: world.fixtures.connection_groups_order.map(([kind, name, note]) => ({
      name,
      note,
      connections: every.filter((c) => c.kind === kind),
    })),
  };
}

/** Voice profiles, with the call voice and the celebrity lock read from the settings. */
export function voice(world: MockWorld): Schemas["VoiceOverview"] {
  const celebrity = isOn(world, "voice.profiles.celebrity_clones");
  const selected = setting(world, VOICE_SETTING);
  return {
    calls_enabled: isOn(world, "voice.enabled"),
    celebrity_clones: celebrity,
    profiles: Object.values(world.accounts.voices).map((profile) => ({
      ...profile,
      selected: profile.id === selected,
      locked: profile.kind === "celebrity_clone" && !celebrity,
    })),
    stock_voices: world.fixtures.stock_voices.filter((v) => !(v.id in world.accounts.voices)),
    script: world.constants.call_script,
    script_lines: world.fixtures.call_lines,
    risk_notice: world.fixtures.risk_notice,
  };
}

/** Kill switch, workspaces, flags, denied calls, sign-in and masked audit lines. */
export function security(world: MockWorld): Schemas["SecurityOverview"] {
  const state = world.accounts;
  const allowlist = Object.values(world.contacts)
    .filter((c) => c.trust === "allowlisted")
    .map((c) => ({ id: c.id, title: c.name, meta: c.meta, status: null, href: "/contacts" }));
  const tiles = world.fixtures.security_tiles.map((tile) => ({
    ...tile,
    value: tile.name === "Allowlist" ? String(allowlist.length) : tile.value,
    sampled_at: world.sampledAt.toISOString(),
  }));
  return {
    stopped: world.stopped,
    tiles,
    workspaces: Object.values(state.workspaces),
    flags: world.fixtures.security_flags,
    denied: world.fixtures.denied_calls,
    allowlist,
    devices: Object.values(state.devices),
    passkeys: Object.values(state.passkeys),
    totp: state.totp,
    recovery: state.recovery,
    audit: world.fixtures.audit_lines,
    chain: "Chain verified 00:00 · 0 breaks",
  };
}

// Connections ----------------------------------------------------------------------------------

/** What a connection's status says, from its state. An error outranks everything else. */
function connectionStatus(c: Connection): StatusLabel {
  if (c.last_error) return { status: "problem", label: "Error" };
  if (c.permission !== null) return PERMISSION_WORDS[c.permission] as StatusLabel;
  if (c.kind === "provider") {
    const stored = c.secret === "stored";
    return { status: stored ? "healthy" : "neutral", label: stored ? "Key stored" : "No key" };
  }
  if (!c.connected) return { status: "neutral", label: "Not connected" };
  return { status: "healthy", label: "Connected" };
}

function connection(world: MockWorld, id: string): Connection {
  const found = world.accounts.connections[id];
  if (!found) throw notFound("That connection doesn't exist.");
  return found;
}

function changed(world: MockWorld, c: Connection, message: string): ConnectionResult {
  c.status = connectionStatus(c);
  world.bus.changed(...CONNECTION_PAGES);
  return { connection: c, message, ok: true };
}

/** Connects an account or platform link, behind a step-up. */
export function connect(world: MockWorld, id: string, stepUp: string | null): ConnectionResult {
  const c = connection(world, id);
  if (c.kind === "mac_app") throw conflict(`macOS asks for ${c.title}. Ask again from its menu.`);
  if (c.kind === "provider") throw conflict(`${c.title} connects when you enter its key.`);
  if (c.connected) throw conflict(`${c.title} is already connected.`);
  requireStepUp(world, stepUp, `Connecting ${c.title} needs your passkey.`);
  c.connected = true;
  c.last_error = null;
  return changed(world, c, `${c.title} is connected`);
}

/** Disconnects at once; a provider's key goes with it. */
export function disconnect(world: MockWorld, id: string): ConnectionResult {
  const c = connection(world, id);
  if (c.kind === "mac_app") {
    throw conflict(`Turn ${c.title} off in System Settings → Privacy on the Mac.`);
  }
  if (!c.connected) throw conflict(`${c.title} isn't connected.`);
  c.connected = false;
  c.last_error = null;
  if (c.kind === "provider") {
    c.secret = "none";
    c.secret_note = null;
  }
  return changed(world, c, `${c.title} is disconnected`);
}

/** Enters or rotates a secret, behind a step-up. It is never sent back. */
export function setSecret(
  world: MockWorld,
  id: string,
  value: string,
  stepUp: string | null,
): ConnectionResult {
  const c = connection(world, id);
  if (c.secret === null) throw conflict(`${c.title} doesn't use a key.`);
  if (!value.trim()) throw conflict("Paste the key first.");
  const rotating = c.secret === "stored";
  requireStepUp(world, stepUp, `Storing a key for ${c.title} needs your passkey.`);
  c.secret = "stored";
  c.secret_note = "Stored just now · never shown again";
  c.connected = true;
  c.last_error = null;
  return changed(world, c, `${rotating ? "Key replaced" : "Key stored"} for ${c.title}`);
}

/** Removes a stored secret at once. */
export function removeSecret(world: MockWorld, id: string): ConnectionResult {
  const c = connection(world, id);
  if (c.secret !== "stored") throw conflict(`No key is stored for ${c.title}.`);
  c.secret = "none";
  c.secret_note = null;
  c.connected = false;
  return changed(world, c, `Key removed for ${c.title}`);
}

/** Shows a macOS permission prompt again. */
export function askPermission(world: MockWorld, id: string): ConnectionResult {
  const c = connection(world, id);
  if (c.kind !== "mac_app") throw conflict(`${c.title} has no macOS prompt.`);
  if (c.permission === "allowed") throw conflict(`${c.title} is already allowed.`);
  c.permission = "waiting";
  return changed(world, c, `macOS is asking about ${c.title} on the Mac`);
}

/** Checks that a connection answers. */
export function testConnection(world: MockWorld, id: string): ConnectionResult {
  const c = connection(world, id);
  if (!c.connected) throw conflict(`Connect ${c.title} first.`);
  if (c.last_error) {
    const failed = `${c.title} still fails: ${c.last_error}.`;
    return { connection: c, message: `${failed} Replace its key.`, ok: false };
  }
  c.last_sync = "just now";
  return changed(world, c, `${c.title} answered in 0.2 s`);
}

// Voice ----------------------------------------------------------------------------------------

/** A profile id from its name: "Grandma" → "grandma", then "grandma_2" if that is taken. */
function voiceId(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "voice";
  let found = base;
  for (let n = 2; taken.has(found); n += 1) found = `${base}_${n}`;
  return found;
}

function voiceMeta(kind: string, engine: string): string {
  return {
    default: "Twilio's own voice · used whenever a clip is missing",
    stock: `${engine} · free · runs on the Mac`,
    consented_clone: `${engine} · consent recorded · watermarked`,
    celebrity_clone: `${engine} · private · calls to you only · watermarked`,
  }[kind] as string;
}

function newProfile(
  id: string,
  fields: { name: string; kind: VoiceProfile["kind"]; engine: string },
  record: string | null,
  sample: string | null,
): VoiceProfile {
  return {
    id,
    ...fields,
    meta: voiceMeta(fields.kind, fields.engine),
    record,
    sample,
    clips: 0,
    rendered_at: null,
    selected: false,
    locked: false,
  };
}

function voiceProfile(world: MockWorld, id: string): VoiceProfile {
  const found = world.accounts.voices[id];
  if (!found) throw notFound("That voice doesn't exist.");
  return found;
}

const locked = (world: MockWorld, p: VoiceProfile) =>
  p.kind === "celebrity_clone" && !isOn(world, "voice.profiles.celebrity_clones");

function rendered(world: MockWorld, p: VoiceProfile): void {
  p.clips = world.fixtures.call_lines.length;
  p.rendered_at = world.clock().toISOString();
}

function cloneProfile(
  world: MockWorld,
  body: Schemas["NewVoiceProfile"],
  stepUp: string | null,
): VoiceProfile {
  const name = (body.name ?? "").trim();
  const sample = (body.sample ?? "").trim();
  if (!name) throw conflict("Name the voice first.");
  if (!sample) throw conflict("Record or upload a sample first.");
  let record: string;
  if (body.kind === "consented_clone") {
    const consent = (body.consent ?? "").trim();
    if (!consent) throw conflict(`Say how ${name} agreed to have their voice cloned.`);
    record = `Consent recorded · ${consent}`;
  } else {
    if (!isOn(world, "voice.profiles.celebrity_clones")) {
      throw conflict("Turn on Private celebrity clones first.");
    }
    if (!body.risk_acknowledged) throw conflict("Acknowledge the risk notice first.");
    record = "Risk notice acknowledged just now";
  }
  requireStepUp(world, stepUp, "Adding a cloned voice needs your passkey.");
  const id = voiceId(name, new Set(Object.keys(world.accounts.voices)));
  return newProfile(id, { name, kind: body.kind, engine: CHATTERBOX }, record, sample);
}

/** Adds a stock voice in one tap, or a clone behind a step-up. */
export function addVoiceProfile(
  world: MockWorld,
  body: Schemas["NewVoiceProfile"],
  stepUp: string | null,
): VoiceProfile {
  let profile: VoiceProfile;
  if (body.kind === "stock") {
    const stock = world.fixtures.stock_voices.find((v) => v.id === body.stock_id);
    if (!stock) throw notFound("That stock voice doesn't exist.");
    if (stock.id in world.accounts.voices) throw conflict(`${stock.name} is already a profile.`);
    profile = newProfile(stock.id, { name: stock.name, kind: "stock", engine: KOKORO }, null, null);
  } else {
    profile = cloneProfile(world, body, stepUp);
  }
  rendered(world, profile);
  world.accounts.voices[profile.id] = profile;
  world.settings[VOICE_SETTING]?.choices.push(profile.id);
  world.bus.changed(...VOICE_PAGES);
  return profile;
}

/** Renders a profile's script lines again. */
export function renderVoiceProfile(world: MockWorld, id: string): VoiceProfile {
  const profile = voiceProfile(world, id);
  if (profile.kind === "default") throw conflict("Twilio's own voice has no clips to render.");
  if (locked(world, profile)) {
    throw conflict("Turn on Private celebrity clones to use this voice.");
  }
  rendered(world, profile);
  world.bus.changed(...VOICE_PAGES);
  return profile;
}

/** The lines a preview plays, in Brain only. */
export function previewVoiceProfile(world: MockWorld, id: string): Schemas["VoicePreview"] {
  const profile = voiceProfile(world, id);
  if (profile.kind === "default") throw conflict("Twilio's own voice is heard only on a call.");
  if (locked(world, profile)) {
    throw conflict("Turn on Private celebrity clones to use this voice.");
  }
  return {
    profile_id: profile.id,
    lines: world.fixtures.call_lines,
    message: `Playing ${profile.name} on this device. The clips stay on the Mac.`,
  };
}

/** Deletes a profile with its sample and clips; calls fall back to Twilio's voice. */
export function deleteVoiceProfile(world: MockWorld, id: string): void {
  const profile = voiceProfile(world, id);
  if (profile.kind === "default") {
    throw conflict("Twilio's own voice is the fallback and can't be deleted.");
  }
  Reflect.deleteProperty(world.accounts.voices, id);
  const item = world.settings[VOICE_SETTING];
  if (item) {
    if (item.value === id) {
      item.history.unshift({
        at: world.clock().toISOString(),
        old: id,
        new: DEFAULT_VOICE,
        via: "brain",
      });
      item.value = DEFAULT_VOICE;
    }
    item.choices = item.choices.filter((c) => c !== id);
  }
  world.bus.changed(...VOICE_PAGES);
}

// Security -------------------------------------------------------------------------------------

function workspace(world: MockWorld, id: string): Schemas["Workspace"] {
  const found = world.accounts.workspaces[id];
  if (!found) throw notFound("That workspace doesn't exist.");
  return found;
}

/** Stops one workspace at once. */
export function stopWorkspace(world: MockWorld, id: string): Schemas["Workspace"] {
  const found = workspace(world, id);
  found.stopped = true;
  world.bus.changed(...SECURITY_PAGES);
  return found;
}

/** Resumes a stopped workspace, behind a step-up. */
export function resumeWorkspace(
  world: MockWorld,
  id: string,
  stepUp: string | null,
): Schemas["Workspace"] {
  const found = workspace(world, id);
  if (!found.stopped) throw conflict(`${found.name} is already running.`);
  requireStepUp(world, stepUp, `Resuming ${found.name} needs your passkey.`);
  found.stopped = false;
  world.bus.changed(...SECURITY_PAGES);
  return found;
}

/** Ends a device's session at once; the one in use stays. */
export function signOutDevice(world: MockWorld, id: string): Schemas["SecurityResult"] {
  const device = world.accounts.devices[id];
  if (!device) throw notFound("That device is already signed out.");
  if (device.current) throw conflict("That's the device you're using. Close Brain here instead.");
  Reflect.deleteProperty(world.accounts.devices, id);
  world.bus.changed(...SECURITY_PAGES);
  return { message: `${device.name} is signed out` };
}

/** Registers a passkey, behind a step-up. */
export function addPasskey(
  world: MockWorld,
  name: string,
  stepUp: string | null,
): Schemas["Passkey"] {
  if (!name.trim()) throw conflict("Name the device first.");
  requireStepUp(world, stepUp, "Adding a passkey needs one you already have.");
  const passkey = {
    id: `pk-${world.ids(2)}`,
    name: name.trim(),
    meta: "Added just now · not used yet",
  };
  world.accounts.passkeys[passkey.id] = passkey;
  world.bus.changed(...SECURITY_PAGES);
  return passkey;
}

/** Removes a passkey, behind a step-up; the last one only goes at the desk. */
export function removePasskey(
  world: MockWorld,
  id: string,
  stepUp: string | null,
): Schemas["SecurityResult"] {
  const passkeys = world.accounts.passkeys;
  const passkey = passkeys[id];
  if (!passkey) throw notFound("That passkey is already removed.");
  if (Object.keys(passkeys).length === 1) {
    throw conflict("That's your last passkey. Remove it at the desk with aigate step-up.");
  }
  requireStepUp(world, stepUp, `Removing the ${passkey.name} passkey needs your passkey.`);
  Reflect.deleteProperty(passkeys, id);
  world.bus.changed(...SECURITY_PAGES);
  return { message: `The ${passkey.name} passkey is removed` };
}

/** Replaces the Discord authenticator secret, behind a step-up. */
export function resetTotp(world: MockWorld, stepUp: string | null): Schemas["TotpReset"] {
  requireStepUp(world, stepUp, "Resetting the Discord authenticator needs your passkey.");
  world.accounts.totp = "Reset just now · scan the new key";
  world.bus.changed(...SECURITY_PAGES);
  return {
    setup_key: world.ids(10).toUpperCase(),
    message: "Add this key to your authenticator now. It won't be shown again.",
  };
}

/** Issues new recovery codes, behind a step-up. */
export function regenerateRecoveryCodes(
  world: MockWorld,
  stepUp: string | null,
): Schemas["RecoveryCodes"] {
  requireStepUp(world, stepUp, "New recovery codes need your passkey.");
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => world.ids(4));
  world.accounts.recovery = `${RECOVERY_CODE_COUNT} new codes made just now`;
  world.bus.changed(...SECURITY_PAGES);
  return { codes, message: "Print or save these now. The old codes no longer work." };
}

/** A filtered range of the masked audit log. */
export function exportAudit(
  world: MockWorld,
  range: string,
  words: string,
): Schemas["AuditExport"] {
  const needle = words.trim().toLowerCase();
  const lines = world.fixtures.audit_lines.filter((line) => line.toLowerCase().includes(needle));
  const count = lines.length === 1 ? "1 line" : `${lines.length} lines`;
  return { filename: `audit-${range}.txt`, lines, message: `Exported ${count}` };
}

/** Exports all data or one principal's, behind a step-up. */
export function exportData(
  world: MockWorld,
  scope: string,
  stepUp: string | null,
): Schemas["ExportStarted"] {
  const what = EXPORT_SCOPES[scope] ?? scope;
  requireStepUp(world, stepUp, `Exporting ${what} needs your passkey.`);
  return {
    message:
      `Exporting ${what} to Exports on the working drive. Voice samples and clips are left ` +
      "out. You'll get a notice when it's ready.",
  };
}

// Impact previews ------------------------------------------------------------------------------

function settingFor(world: MockWorld, key: string): Schemas["Setting"] {
  const found = world.settings[key];
  if (!found) throw notFound(`There is no setting called ${key}.`);
  return found;
}

function switchOnLines(world: MockWorld, key: string): ImpactLine[] {
  if (key === "models.review.independent") return world.fixtures.reviewer_impact;
  const feature = world.fixtures.paid_features.find(([, , , switchKey]) => switchKey === key);
  if (feature) {
    const ceiling = world.settings[feature[4]]?.ceiling ?? 0;
    return world.fixtures.cloud_impact[String(ceiling)] ?? [];
  }
  return world.fixtures.extra_impacts[key] ?? [];
}

function impactLines(world: MockWorld, item: Schemas["Setting"], value: string): ImpactLine[] {
  if (value === item.value) return [];
  if (item.key.startsWith("models.tokens.")) return world.fixtures.tokens_panel.cap_impact;
  if (item.kind === "money") {
    if (Number(value) <= Number(item.value)) return [];
    return [
      {
        name: "Most this can spend a month",
        change: `$${item.value} → $${value}`,
        source: "measured",
        status: null,
      },
      {
        name: "Spend forecast this month",
        change: `$0 → up to $${value}`,
        source: "simulated",
        status: null,
      },
    ];
  }
  return choiceLines(world, item, value);
}

/** A switch or choice: turning something on, or raising maintenance to fix. */
function choiceLines(world: MockWorld, item: Schemas["Setting"], value: string): ImpactLine[] {
  const onOff = item.kind === "switch" || item.choices.join() === "off,on";
  if (onOff && value === "on") return switchOnLines(world, item.key);
  if (item.key.startsWith("maintenance.") && value === "fix") {
    return world.fixtures.extra_impacts["maintenance.*=fix"] ?? [];
  }
  return [];
}

/** What changing a setting would do, before it is applied. */
export function settingImpact(
  world: MockWorld,
  key: string,
  value: string,
): Schemas["SettingImpact"] {
  const item = settingFor(world, key);
  validate(item, value);
  return { key, value, lines: impactLines(world, item, value) };
}

/** Predicted versus actual for the latest change of a setting with a recorded prediction. */
export function settingOutcomes(world: MockWorld, key: string): Schemas["SettingOutcomes"] {
  const item = settingFor(world, key);
  const lines = world.fixtures.outcomes[key];
  const change = item.history[0];
  if (!lines || lines.length === 0 || !change) return { key, outcomes: [] };
  const due = Date.parse(change.at) + world.constants.outcome_after_seconds * 1000;
  const ready = due <= world.clock().getTime();
  return {
    key,
    outcomes: [
      {
        at: change.at,
        change: `${change.old} → ${change.new}`,
        ready,
        note: ready
          ? "Measured over the 7 days after the change"
          : "Checked 7 days after the change",
        lines: ready ? lines : lines.map((line) => ({ ...line, actual: null })),
      },
    ],
  };
}
