/**
 * @file The in-browser mock world: the state the server's mock backends start from, moved to now.
 *
 * `mock-world.json` is written by `scripts/export_mock_world.py` from the Python fixtures, so the
 * preview and the server start from the same data and a fixture edit reaches both (`make ci`
 * fails if the file is stale). Every time in it was built against one fixed instant; loading
 * moves each one by the same amount, so "expires in 6 hours" still reads that way today.
 */
import exported from "./mock-world.json";
import type { Bus } from "./bus";
import type {
  Approval,
  Case,
  ChatLead,
  ChatMessage,
  Contact,
  MemoryItem,
  CriticalDecision,
  Employee,
  Job,
  LiveTask,
  Setting,
  SetupStep,
  TranscriptEntry,
  WorkItem,
} from "../api/types";
import type { components } from "../api/schema";

type Schemas = components["schemas"];

/** What is recorded about a thread; its state is derived from this (`threads.py`). */
export interface ThreadRecord {
  id: string;
  title: string;
  kind: Schemas["Thread"]["kind"];
  unit_id: string | null;
  lead_id: string;
  lead_name: string;
  lead_department: Schemas["Thread"]["lead_department"];
  pipeline: string;
  principal: Schemas["Thread"]["principal"];
  since: string;
  owner_decision: string | null;
  approval_id: string | null;
  proposed_resolution: string | null;
  waiting_for: string | null;
  outcome: string | null;
  branched_from: string | null;
  /** When a temporary chat is deleted (15.9.6); null for every other thread. */
  temporary_until: string | null;
  learning: boolean;
  /** The Owner's pause on the thread's idea or work item (spec 7.10). */
  paused: boolean;
  /** A resolved thread past its archive delay, shown only under the Archived filter. */
  archived: boolean;
}

/** Every piece of mutable mock state, as in `world.py`. */
interface WorldState {
  approvals: Record<string, Approval>;
  decisions: Record<string, CriticalDecision>;
  settings: Record<string, Setting>;
  contacts: Record<string, Contact>;
  household: Record<string, Schemas["HouseholdMember"]>;
  /** Messages and approvals with each contact, newest first, by contact id. */
  contact_history: Record<string, Schemas["ContactEvent"][]>;
  tasks: Record<string, LiveTask>;
  transcripts: Record<string, TranscriptEntry[]>;
  threads: Record<string, ThreadRecord>;
  work_items: WorkItem[];
  ideas: Record<string, Schemas["Idea"]>;
  products: Record<string, Schemas["Product"]>;
  employees: Record<string, Employee>;
  proposals: Record<string, Schemas["LifecycleProposal"]>;
  cases: Record<string, Case>;
  changes: Record<string, Schemas["AutomaticChange"]>;
  setup: Record<string, SetupStep>;
  jobs: Record<string, Job>;
  fixes: Record<string, Schemas["MaintenanceFix"]>;
  chats: Record<string, ChatMessage[]>;
  /** The newest message of the branch on show in each conversation (`chat_tree.py`). */
  chat_heads: Record<string, string>;
  alerts: Record<string, Schemas["Alert"]>;
  trash: Record<string, Schemas["TrashItem"]>;
  stopped: boolean;
  maintenance_running: boolean;
  /** The Owner's saved notes (15.9.2), by id. */
  memories: Record<string, MemoryItem>;
  memory_paused: boolean;
}

/** A paid feature row: id, name, kind, switch setting, cap setting (`platform.PAID_FEATURES`). */
export type PaidFeatureRow = [string, string, string, string, string];

/** The read-only fixture views, with each variant a setting can select. */
interface Fixtures {
  hard_limits: Schemas["SettingsIndex"]["hard_limits"];
  linkable_accounts: Schemas["LinkableAccount"][];
  /** Personal rules that name a contact: id, title and the contacts they mention. */
  contact_rules: [string, string, string[]][];
  service_groups: Schemas["ServiceGroup"][];
  memory_zones: Schemas["MemoryZone"][];
  health_metrics: Schemas["Metric"][];
  /** What each health sample reads next, per figure: the words and the new sparkline point. */
  health_readings: Record<string, [string, number][]>;
  system_tiles: Schemas["Metric"][];
  system_rows: Schemas["SystemOverview"]["rows"];
  family_assignments: Record<"independent" | "shared", Schemas["ModelsOverview"]["assignments"]>;
  reviewer_impact: Schemas["ModelsOverview"]["reviewer_impact"];
  model_stats: Schemas["ModelsOverview"]["stats"];
  tokens_panel: Schemas["ModelsOverview"]["tokens"];
  paid_features: PaidFeatureRow[];
  cloud_impact: Record<string, Schemas["PaidFeature"]["impact"]>;
  security_tiles: Schemas["Metric"][];
  security_flags: Schemas["SecurityOverview"]["flags"];
  sign_in_rows: Schemas["SecurityOverview"]["sign_in"];
  audit_lines: Schemas["SecurityOverview"]["audit"];
  backup_targets: Schemas["BackupsOverview"]["targets"];
  retention: Schemas["BackupsOverview"]["retention"];
  connection_groups: Schemas["RowGroup"][];
  voice_profiles: Record<string, Schemas["VoiceOverview"]["profiles"]>;
  maintenance_stats: Schemas["MaintenanceOverview"]["stats"];
  findings: Schemas["MaintenanceOverview"]["findings"];
  agenda: Schemas["TodayOverview"]["agenda"];
  domains: Schemas["PersonalOverview"]["domains"];
  finance: Record<string, Schemas["FinanceOverview"]>;
  doc_groups: Schemas["DocsOverview"]["groups"];
  search_index: Schemas["SearchSection"][];
  wayfinder_answers: Record<string, string>;
  reviews: Schemas["WorkBoard"]["reviews"];
  item_history: Record<string, Schemas["StageEvent"][]>;
  item_gates: Record<string, Schemas["GateCheck"][]>;
  item_diffs: Record<string, Schemas["DiffFile"][]>;
  new_item_history: Schemas["StageEvent"][];
  new_item_gates: Schemas["GateCheck"][];
  retirement_label: string;
  task_stages: Record<string, string>;
  stage_rails: Record<string, Schemas["Stage"][]>;
  not_yet_hired: string[];
  chat_leads: ChatLead[];
  mock_reply: string;
  mock_retry: string;
  thread_leads: Record<string, [string, Schemas["Thread"]["lead_department"], string]>;
  doc_bodies: Record<string, Schemas["DocBlock"][]>;
  intake_stage: { stages: Schemas["Stage"][]; label: string };
  guide_pages: Record<string, [string, Schemas["GuideSource"][]]>;
  guide_fallback: string;
  offline_pack: Schemas["RowGroup"][];
  library_categories: Schemas["LibraryOverview"]["categories"];
  quick_cards: Schemas["QuickCard"][];
  library_tiers: Schemas["LibraryTier"][];
  red_flags: Record<string, string>;
  library_answers: Record<string, [string, Schemas["LibraryCitation"][]]>;
  library_caveat: string;
  no_passage: string;
}

/** The rules' numbers and words, read from the Python modules instead of repeated here. */
interface Constants {
  undo_window_seconds: number;
  step_up_lifetime_seconds: number;
  mock_assertion_prefix: string;
  word_delay_seconds: number;
  title_words: number;
  temporary_retain_hours: number;
  pinned_max: number;
  forget_undo_seconds: number;
  items_per_turn: number;
  item_max_chars: number;
  max_learned_per_turn: number;
  instrument_count: number;
  needs_you_shown: number;
  team_shown: number;
  state_order: Schemas["Thread"]["state"][];
  blocked_words: Record<string, string>;
  waiting_words: Record<string, string>;
  call_script: string;
  pool_mode: string;
  backup_mode: Schemas["StatusLabel"];
  tick_seconds: number;
  transcript_every_ticks: number;
  sample_every_ticks: number;
  rate_bounds: [number, number];
  streamed_code: string;
  trash_days: number;
  snooze_seconds: number;
  app_features: string[];
  ark_volumes: string[];
  priority_order: Schemas["Idea"]["priority"][];
  idea_lead: string;
  retirement_summary: string;
  role_source: string;
  wip_stages: string[];
  wip_global: number;
  principal_undo_days: number;
}

interface Exported {
  exported_at: string;
  world: WorldState;
  fixtures: Fixtures;
  constants: Constants;
}

/** Makes ids the way `secrets.token_hex` and `token_urlsafe` do; tests pass a counter instead. */
export type IdSource = (bytes: number) => string;

/** A random id of `bytes` bytes, hex encoded. */
const randomIds: IdSource = (bytes) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

/** The world, its clock, its event bus and the fixtures, as every mock part sees them. */
export interface MockWorld extends WorldState {
  bus: Bus;
  clock: () => Date;
  ids: IdSource;
  fixtures: Fixtures;
  constants: Constants;
  sampledAt: Date;
  /** How many health samples have been taken; the health figures move with it. */
  samples: number;
  stepUpChallenges: Set<string>;
  stepUpProofs: Map<string, Date>;
  /** Items forgotten in the last ten minutes, with when their undo runs out (15.9.7). */
  memoryForgotten: Map<string, { item: MemoryItem; until: Date }>;
  /** What each trash item held when it was deleted, for its restorer (`shell.sendToTrash`). */
  trashed: Map<string, unknown>;
}

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** A deep copy of `value` with every ISO time moved by `shiftMs`. */
function shifted<T>(value: T, shiftMs: number): T {
  return JSON.parse(JSON.stringify(value), (_key, item: unknown) =>
    typeof item === "string" && ISO_TIME.test(item)
      ? new Date(Date.parse(item) + shiftMs).toISOString()
      : item,
  ) as T;
}

const DATA = exported as unknown as Exported;

/** A fresh world, with every exported time moved so the export instant becomes `clock()`. */
export function buildWorld(bus: Bus, clock: () => Date, ids: IdSource = randomIds): MockWorld {
  const now = clock();
  const shiftMs = now.getTime() - Date.parse(DATA.exported_at);
  return {
    ...shifted(DATA.world, shiftMs),
    bus,
    clock,
    ids,
    fixtures: shifted(DATA.fixtures, shiftMs),
    constants: DATA.constants,
    sampledAt: now,
    samples: 0,
    stepUpChallenges: new Set(),
    stepUpProofs: new Map(),
    memoryForgotten: new Map(),
    trashed: new Map(),
  };
}

/** The current value of a setting. */
export function setting(world: MockWorld, key: string): string {
  const found = world.settings[key];
  if (!found) throw new Error(`Unknown setting ${key}`);
  return found.value;
}

/** Whether a switch setting is on. */
export const isOn = (world: MockWorld, key: string): boolean => setting(world, key) === "on";
