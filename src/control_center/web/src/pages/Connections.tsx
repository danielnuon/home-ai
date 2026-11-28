/**
 * @file Connections: every account, app and provider Brain is connected to (spec 7.2; design:
 * Connections). Each one is managed where it is seen (7.16, rule 1).
 *
 * Connecting and entering a key loosen, so the gate asks for the passkey; disconnecting and
 * removing a key tighten, so they take one tap (rule 3). A key typed here goes to the secrets
 * broker and is never shown again. Pressing a row opens its details in place, with every action
 * as a button; the same actions are its swipes and its "…" menu.
 */
import {
  ArrowUpRight,
  Activity,
  KeyRound,
  Link2,
  Link2Off,
  RotateCcw,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useConnections } from "../api/queries";
import type { Connection, ConnectionGroup, ConnectionResult } from "../api/types";
import { ActionRow } from "../components/ActionRow";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { Sheet } from "../components/Sheet";
import { StatusText } from "../design/status";

interface ConnectionAction {
  label: string;
  icon: LucideIcon;
  tone?: "accent" | "sand" | "clay";
  destructive?: boolean;
  onSelect: () => void;
}

type Post = (connection: Connection, verb: string) => void;

/** Runs one connection action and toasts its answer, which says what to do if it failed. */
function useConnectionAction() {
  const { run, busy } = useAction<ConnectionResult>({
    refresh: ["connections"],
    done: (result) => result.message,
  });
  const post = (connection: Connection, verb: string) =>
    void run((proof) =>
      send<ConnectionResult>("POST", `/connections/${connection.id}/${verb}`, undefined, proof),
    );
  return { post, busy };
}

/** A Mac app's actions: re-ask macOS for its permission, and test it once allowed. */
function macAppActions(connection: Connection, post: Post, test: ConnectionAction) {
  const actions: ConnectionAction[] = [];
  if (connection.permission !== "allowed") {
    actions.push({
      label: "Ask macOS again",
      icon: RotateCcw,
      onSelect: () => post(connection, "permission"),
    });
  }
  if (connection.connected) actions.push(test);
  return actions;
}

/** How a connection is ended: removing its key, or disconnecting it. */
function endAction(connection: Connection, post: Post): ConnectionAction | null {
  if (connection.secret === "stored") {
    return {
      label: "Remove key",
      icon: Trash2,
      tone: "clay",
      destructive: true,
      onSelect: () => post(connection, "secret/remove"),
    };
  }
  if (connection.connected && connection.kind !== "provider") {
    return {
      label: "Disconnect",
      icon: Link2Off,
      tone: "clay",
      destructive: true,
      onSelect: () => post(connection, "disconnect"),
    };
  }
  return null;
}

/** Every action a connection offers, main one first, in the order its sheet lists them. */
function actionsFor(
  connection: Connection,
  post: Post,
  openKey: () => void,
  openHome: () => void,
): ConnectionAction[] {
  const test = { label: "Test", icon: Activity, onSelect: () => post(connection, "test") };
  if (connection.kind === "mac_app") return macAppActions(connection, post, test);
  const actions: ConnectionAction[] = [];
  if (connection.kind !== "provider" && !connection.connected) {
    actions.push({ label: "Connect", icon: Link2, onSelect: () => post(connection, "connect") });
  }
  if (connection.secret !== null) {
    const label = connection.secret === "stored" ? "Replace key" : "Enter key";
    actions.push({ label, icon: KeyRound, onSelect: openKey });
  }
  if (connection.connected) actions.push(test);
  const end = endAction(connection, post);
  if (end) actions.push(end);
  if (connection.href) {
    const page = connection.href === "/spend" ? "Spend" : "Setup";
    actions.push({ label: `Open ${page}`, icon: ArrowUpRight, onSelect: openHome });
  }
  return actions;
}

/** The facts the details sheet lists, only those the connection has. */
function facts(connection: Connection): [string, string][] {
  const found: [string, string | null | undefined][] = [
    ["Permission", connection.permission],
    ["Scopes", connection.scopes.join(" · ")],
    ["Last sync", connection.last_sync],
    ["Key", connection.secret_note ?? (connection.secret === "none" ? "No key entered" : null)],
    ["Expires", connection.expires],
    ["Last push", connection.last_push],
  ];
  return found.filter((fact): fact is [string, string] => Boolean(fact[1]));
}

/** Where a key is typed. It goes to the secrets broker; nothing here can read it back. */
function KeySheet({ connection, onClose }: { connection: Connection | null; onClose: () => void }) {
  const [value, setValue] = useState("");
  const { run, busy } = useAction<ConnectionResult>({
    refresh: ["connections"],
    done: (result) => result.message,
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!connection) return;
    const done = await run((proof) =>
      send<ConnectionResult>("PUT", `/connections/${connection.id}/secret`, { value }, proof),
    );
    if (done) {
      setValue("");
      onClose();
    }
  };
  return (
    <Sheet
      open={connection !== null}
      title={`Key for ${connection?.title ?? ""}`}
      onClose={onClose}
    >
      <form className="stack" onSubmit={(event) => void submit(event)}>
        <p className="muted small">
          The secrets broker stores it. Brain never shows it again, and storing it needs your
          passkey.
        </p>
        <input
          className="field"
          type="password"
          autoComplete="off"
          aria-label="Key"
          placeholder="Paste the key"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button type="submit" className="btn primary sheet-action" disabled={busy || !value.trim()}>
          Store key
        </button>
      </form>
    </Sheet>
  );
}

/** One connection's details and every action it offers, as buttons. */
function DetailSheet({
  connection,
  actions,
  onClose,
}: {
  connection: Connection | null;
  actions: ConnectionAction[];
  onClose: () => void;
}) {
  return (
    <Sheet open={connection !== null} title={connection?.title ?? ""} onClose={onClose}>
      {connection && (
        <div className="stack">
          <div className="row">
            <span className="grow muted small">{connection.meta}</span>
            <StatusText value={connection.status} className="small" />
          </div>
          {connection.last_error && (
            <p className="card attention small" role="status">
              {connection.last_error}
            </p>
          )}
          <dl className="list facts">
            {facts(connection).map(([name, value]) => (
              <div key={name} className="list-row">
                <dt className="grow">{name}</dt>
                <dd className="muted">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="row wrap" style={{ ["--gap" as string]: "var(--space-2)" }}>
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                className={`btn${action.destructive ? " destructive" : ""}`}
                onClick={() => {
                  action.onSelect();
                  if (action.destructive || action.label.startsWith("Open")) onClose();
                }}
              >
                <action.icon size={16} aria-hidden="true" /> {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** Each group of connections as rows: swipe right for the main action, left to end it. */
function ConnectionGroups({
  groups,
  actions,
  onOpen,
}: {
  groups: ConnectionGroup[];
  actions: (connection: Connection) => ConnectionAction[];
  onOpen: (id: string) => void;
}) {
  return (
    <>
      {groups.map((group) => (
        <Section key={group.name} title={group.name} aside={group.note}>
          <div className="list">
            {group.connections.map((connection) => {
              const offered = actions(connection);
              const [first, ...rest] = offered;
              return (
                <ActionRow
                  key={connection.id}
                  title={connection.title}
                  meta={connection.last_error ?? connection.meta}
                  status={connection.status}
                  onOpen={() => onOpen(connection.id)}
                  start={first && !first.destructive ? first : undefined}
                  end={rest.find((a) => a.destructive)}
                  more={offered}
                />
              );
            })}
          </div>
        </Section>
      ))}
    </>
  );
}

/** The Connections page. */
export default function Connections() {
  const query = useConnections();
  const navigate = useNavigate();
  const { post } = useConnectionAction();
  const [openId, setOpenId] = useState<string | null>(null);
  const [keyId, setKeyId] = useState<string | null>(null);
  const every = query.data?.groups.flatMap((group) => group.connections) ?? [];
  const find = (id: string | null) => every.find((c) => c.id === id) ?? null;
  const actions = (connection: Connection) =>
    actionsFor(
      connection,
      post,
      () => {
        setOpenId(null);
        setKeyId(connection.id);
      },
      () => navigate(connection.href ?? "/"),
    );
  const open = find(openId);

  return (
    <Page
      title="Connections"
      subtitle="Connecting an account or entering a key needs your passkey; disconnecting never does."
      actions={
        <Link to="/voice" className="btn compact">
          Call voice
        </Link>
      }
    >
      <QueryState query={query}>
        {(overview) => (
          <>
            <ConnectionGroups groups={overview.groups} actions={actions} onOpen={setOpenId} />
          </>
        )}
      </QueryState>
      <DetailSheet
        connection={open}
        actions={open ? actions(open) : []}
        onClose={() => setOpenId(null)}
      />
      <KeySheet connection={find(keyId)} onClose={() => setKeyId(null)} />
    </Page>
  );
}
