/**
 * @file The preview's status aggregator: the read-only platform pages, shaped by the current
 * settings. A port of `backends/mock/status.py`.
 */
import type {
  BackupsOverview,
  ConnectionsOverview,
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
  const pool = world.fixtures.memory_zones.find((zone) => zone.name === "Model pool");
  const healthy = { status: "healthy", label: "Healthy" } as const;
  const tiles: [string, string, Tile["status"], string][] = [
    ["Services", `${running(world)} running`, healthy, "/services"],
    [
      "Model pool",
      `${general(pool?.used_gb ?? 0)} / ${general(pool?.budget_gb ?? 0)} GB`,
      { status: "healthy", label: world.constants.pool_mode },
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

/** Machine, memory zones and hardware signals. */
export function system(world: MockWorld): SystemOverview {
  return {
    summary: { status: "healthy", label: "All clear" },
    machine: "Mac mini M5 Pro · 64 GB · up 12 d 4 h · 0 unexpected reboots",
    zones: world.fixtures.memory_zones,
    pressure: { status: "healthy", label: "Normal" },
    swap: "0.3 GB · alert at 2 GB",
    tiles: sampled(world, world.fixtures.system_tiles),
    rows: world.fixtures.system_rows,
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
  return {
    pool_mode: world.constants.pool_mode,
    resident: "Conversation model + embeddings",
    swaps_today: "3 · plan ≤ 6",
    assignments: world.fixtures.family_assignments[independent ? "independent" : "shared"],
    independent_reviewer: independent,
    reviewer_impact: world.fixtures.reviewer_impact,
    stats: world.fixtures.model_stats,
    tokens: world.fixtures.tokens_panel,
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
    drill: {
      status: { status: "healthy", label: "Passed" },
      detail:
        "Oct 4 · one repository, tasks.db and the audit log restored to a scratch folder · " +
        "hash chain verified · 4 min",
    },
    restore_points: ["Today 20:00", "Yesterday 00:00", "Oct 20 (weekly)"],
    retention: world.fixtures.retention,
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
