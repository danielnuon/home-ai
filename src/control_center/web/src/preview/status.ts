/**
 * @file The preview's status aggregator: the read-only platform pages, shaped by the current
 * settings. A port of `backends/mock/status.py`.
 */
import type {
  BackupsOverview,
  ConnectionsOverview,
  MemoryZone,
  Metric,
  ModelsOverview,
  PaidFeature,
  Row,
  SecurityOverview,
  ServicesOverview,
  SpendOverview,
  SystemOverview,
  Tile,
  VoiceOverview,
} from "../api/types";
import { isOn, setting, type MockWorld, type PaidFeatureRow } from "./world";

const running = (world: MockWorld) =>
  world.fixtures.service_groups
    .flatMap((group) => group.services)
    .filter((service) => service.status.status === "healthy").length;

const sampled = (world: MockWorld, tiles: Metric[]): Metric[] =>
  tiles.map((tile) => ({ ...tile, sampled_at: world.sampledAt.toISOString() }));

/** Formats a number the way Python's `:g` does for these sizes. */
const general = (value: number) => String(Number(value.toPrecision(6)));

/** Today's tiles, from the same figures the pages show. */
export function subsystemTiles(world: MockWorld, spend: SpendOverview): Tile[] {
  const pool = zones(world).find((zone) => zone.name === "Model pool");
  const healthy = { status: "healthy", label: "Healthy" } as const;
  const tiles: [string, string, Tile["status"], string][] = [
    ["Services", `${running(world)} running`, healthy, "/services"],
    [
      "Model pool",
      `${general(pool?.used_gb ?? 0)} / ${general(pool?.budget_gb ?? 0)} GB`,
      { status: "healthy", label: modeName(world) },
      "/models",
    ],
    ["Backups", "20:00 today", world.constants.backup_mode, "/backups"],
    ["Spend", `$${spend.total_usd.toFixed(2)}`, spend.summary, "/spend"],
    ["Connections", "3 of 4", { status: "attention", label: "Contacts waiting" }, "/connections"],
    ["Heartbeat", "1 min ago", { status: "healthy", label: "Reporting" }, "/system"],
  ];
  return tiles.map(([name, value, status, href]) => ({
    name,
    value,
    status,
    href,
    sampled_at: world.sampledAt.toISOString(),
  }));
}

/** A figure after `samples` health samples: the latest reading, the sparkline rolled on. */
function advanced(metric: Metric, readings: [string, number][], samples: number): Metric {
  if (readings.length === 0 || samples === 0) return metric;
  const width = metric.spark.length;
  const taken = [];
  for (let i = Math.max(0, samples - width); i < samples; i += 1) {
    taken.push(readings[i % readings.length] as [string, number]);
  }
  const spark = [...metric.spark, ...taken.map(([, point]) => point)].slice(-width);
  return { ...metric, value: taken[taken.length - 1]?.[0] ?? metric.value, spark };
}

/** Today's live figures after the samples taken so far, stamped like every other sample. */
export const healthMetrics = (world: MockWorld): Metric[] =>
  sampled(
    world,
    world.fixtures.health_metrics.map((metric) =>
      advanced(metric, world.fixtures.health_readings[metric.name] ?? [], world.samples),
    ),
  );

/** The pool mode as Today's tile and Models name it, such as "Mode L". */
const modeName = (world: MockWorld) => `Mode ${world.ops.pool_mode}`;

/** The memory budget; Desk mode moves 4 GB from the pool to your session (8.11.2). */
function zones(world: MockWorld): MemoryZone[] {
  if (!isOn(world, "resources.desk_mode")) return world.fixtures.memory_zones;
  const gb = world.constants.desk_mode_gb;
  const moved: Record<string, number> = { "macOS and your session": gb, "Model pool": -gb };
  return world.fixtures.memory_zones.map((zone) => ({
    ...zone,
    budget_gb: zone.budget_gb + (moved[zone.name] ?? 0),
  }));
}

function pool(world: MockWorld): SystemOverview["pool"] {
  const o = world.fixtures.operations;
  const mode = world.ops.pool_mode;
  const [label, , loaded] = o.pool_modes[mode];
  return {
    mode,
    label,
    loaded,
    can_end: mode === "I",
    options: o.owner_modes.map((option) => ({
      mode: option,
      label: o.pool_modes[option][0],
      note: o.pool_modes[option][1],
      impact: o.mode_impact[option],
    })),
  };
}

/** Machine, memory zones, the host's resource controls and hardware signals. */
export function system(world: MockWorld): SystemOverview {
  const o = world.fixtures.operations;
  const level = world.ops.pressure;
  const [pressure] = o.pressure_words[level];
  return {
    summary:
      level === "normal"
        ? { status: "healthy", label: "All clear" }
        : { status: pressure.status, label: `Memory pressure ${level}` },
    machine: "Mac mini M5 Pro · 64 GB · up 12 d 4 h · 0 unexpected reboots",
    zones: zones(world),
    pressure,
    pressure_level: level,
    swap: "0.3 GB · alert at 2 GB",
    tiles: sampled(world, world.fixtures.system_tiles),
    rows: world.fixtures.system_rows,
    pool: pool(world),
    lanes: o.lanes,
    cpu: o.cpu_classes,
    thermal: o.thermal,
    drives: o.drives,
    model_time: o.model_time,
    health_check: world.ops.health_check,
  };
}

/** Every service with its health. */
export function services(world: MockWorld): ServicesOverview {
  return {
    summary: `${running(world)} running · health checked every minute`,
    groups: world.fixtures.service_groups,
  };
}

/** Assignments and the independent-reviewer preview, following the setting. */
export function models(world: MockWorld): ModelsOverview {
  const independent = isOn(world, "models.review.independent");
  const o = world.fixtures.operations;
  const queued = world.ops.selection_queued;
  return {
    pool_mode: modeName(world),
    resident: "Conversation model + embeddings",
    swaps_today: "3 · plan ≤ 6",
    assignments: world.fixtures.family_assignments[independent ? "independent" : "shared"].map(
      (a) => ({ ...a, pinned: world.ops.pins.includes(a.family) }),
    ),
    independent_reviewer: independent,
    reviewer_impact: world.fixtures.reviewer_impact,
    stats: world.fixtures.model_stats,
    tokens: world.fixtures.tokens_panel,
    queue: o.queue_depth,
    split: o.local_cloud_split,
    routing: o.routing_panel,
    candidates: o.candidates,
    selection: {
      status: queued
        ? { status: "in_progress", label: o.selection_next }
        : { status: "healthy", label: "Idle" },
      last_run: o.selection_idle,
      queued,
    },
    plan_decisions: o.plan_decisions,
    pin_impact: o.pin_impact,
  };
}

function paidFeature(world: MockWorld, [id, name, kind, switchKey, capKey]: PaidFeatureRow) {
  const cap = world.settings[capKey];
  const capUsd = Number(cap?.value ?? 0);
  const ceiling = cap?.ceiling ?? 0;
  const feature: PaidFeature = {
    id,
    name,
    meta: `${kind} · cap $${capUsd}`,
    setting_key: switchKey,
    cap_setting_key: capKey,
    on: isOn(world, switchKey),
    cap_usd: capUsd,
    ceiling_usd: ceiling,
    impact: world.fixtures.cloud_impact[String(ceiling)] ?? [],
  };
  return feature;
}

function offsiteRow(world: MockWorld): PaidFeatureRow {
  const row = world.fixtures.paid_features.find(([id]) => id === world.constants.offsite_feature);
  if (!row) throw new Error("No paid offsite feature");
  return row;
}

/** Paid features with their switches and caps, read from the settings store. */
export function spend(world: MockWorld): SpendOverview {
  const features = world.fixtures.paid_features.map((row) => paidFeature(world, row));
  const summary = features.some((feature) => feature.on)
    ? ({ status: "in_progress", label: "Paid features on · spending stops at caps" } as const)
    : ({ status: "healthy", label: "Everything runs locally. Paid features off." } as const);
  return { month: "October", total_usd: 0, summary, features, ledger: [] };
}

/** Kill switch, flags, sign-in and masked audit lines. */
export function security(world: MockWorld): SecurityOverview {
  return {
    stopped: world.stopped,
    tiles: sampled(world, world.fixtures.security_tiles),
    flags: world.fixtures.security_flags,
    sign_in: world.fixtures.sign_in_rows,
    audit: world.fixtures.audit_lines,
    chain: "Chain verified 00:00 · 0 breaks",
  };
}

/** Starter mode, targets, the last drill and retention. */
export function backups(world: MockWorld): BackupsOverview {
  return {
    mode: world.constants.backup_mode,
    mode_note:
      "Your two drives back each other up. That covers a failed drive and mistakes, not theft, " +
      "fire or a power surge that takes both.",
    targets: world.fixtures.backup_targets,
    drill: world.ops.drill,
    drills: world.ops.drills,
    restore_points: ["Today 20:00", "Yesterday 00:00", "Oct 20 (weekly)"],
    retention: world.fixtures.retention,
    prune_plan: world.ops.prune_plan,
    last_prune: world.ops.last_prune,
    offsite: paidFeature(world, offsiteRow(world)),
  };
}

/** Connections, with paid providers following their settings. */
export function connections(world: MockWorld): ConnectionsOverview {
  const providers: Row[] = world.fixtures.paid_features.map(([id, name, , switchKey]) => {
    const on = isOn(world, switchKey);
    return {
      id,
      title: name,
      meta: on ? "Key stored" : "No key entered",
      href: "/spend",
      status: on ? { status: "healthy", label: "On" } : { status: "neutral", label: "Off" },
    };
  });
  return {
    groups: [
      ...world.fixtures.connection_groups,
      { name: "Optional paid providers", note: "$0 until on", rows: providers },
    ],
  };
}

/** Voice profiles following `voice.profile` and the celebrity-clone setting. */
export function voice(world: MockWorld): VoiceOverview {
  const celebrity = isOn(world, "voice.profiles.celebrity_clones");
  const key = `${setting(world, "voice.profile")}|${String(celebrity)}`;
  return {
    calls_enabled: isOn(world, "voice.enabled"),
    celebrity_clones: celebrity,
    profiles: world.fixtures.voice_profiles[key] ?? [],
    script: world.constants.call_script,
  };
}
