/**
 * @file The Security page's sections and sheets: workspaces, sign-in (devices, passkeys, the
 * Discord authenticator and recovery codes) and the audit export (spec 7.2, Security).
 *
 * Stopping a workspace, signing a device out and exporting the audit tighten or only read, so they
 * take one tap. Resuming, adding or removing a passkey, resetting the authenticator and new
 * recovery codes loosen or replace a credential, so the gate asks for the passkey (rule 3).
 */
import {
  Download,
  KeyRound,
  LogOut,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  UserMinus,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAction } from "../../api/actions";
import { send } from "../../api/client";
import type {
  AuditExport,
  Device,
  Passkey,
  RecoveryCodes,
  Row,
  SecurityOverview,
  SecurityResult,
  TotpReset,
  Workspace,
} from "../../api/types";
import { ActionRow } from "../../components/ActionRow";
import { Segmented } from "../../components/Controls";
import { Section } from "../../components/Page";
import { Sheet } from "../../components/Sheet";

const REFRESH = { refresh: ["security"], done: (r: { message: string }) => r.message };
const GAP = { ["--gap" as string]: "var(--space-2)" };

/** A one-tap security request whose toast is the server's message. */
function useSecurityPost<Result extends { message: string }>() {
  const { run, busy } = useAction<Result>(REFRESH);
  const post = (path: string, body?: unknown) =>
    run((proof) => send<Result>("POST", `/security/${path}`, body, proof));
  return { post, busy };
}

/** Each workspace with its Stop or Resume; resuming needs the passkey. */
export function Workspaces({ workspaces }: { workspaces: Workspace[] }) {
  const { post } = useSecurityPost<SecurityResult>();
  return (
    <Section title="Workspaces" aside="Stop one without stopping the rest">
      <div className="list">
        {workspaces.map((ws) => {
          const action = ws.stopped
            ? {
                label: "Resume",
                icon: Play,
                onSelect: () => void post(`workspaces/${ws.id}/resume`),
              }
            : {
                label: "Stop",
                icon: Pause,
                tone: "clay" as const,
                onSelect: () => void post(`workspaces/${ws.id}/stop`),
              };
          return (
            <ActionRow
              key={ws.id}
              title={ws.name}
              meta={ws.meta}
              status={ws.stopped ? { status: "attention", label: "Stopped" } : null}
              start={ws.stopped ? action : undefined}
              end={ws.stopped ? undefined : action}
              more={[action]}
            />
          );
        })}
      </div>
    </Section>
  );
}

/** Where a new passkey is named before the browser registers it. */
function PasskeySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const { run, busy } = useAction<Passkey>({
    refresh: ["security"],
    done: (key) => `Passkey ${key.name} added`,
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await run((proof) => send<Passkey>("POST", "/security/passkeys", { name }, proof))) {
      setName("");
      onClose();
    }
  };
  return (
    <Sheet open={open} title="Add a passkey" onClose={onClose}>
      <form className="stack" onSubmit={(event) => void submit(event)}>
        <input
          className="field"
          aria-label="Passkey name"
          placeholder="Name, such as Work laptop"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className="btn primary sheet-action" disabled={busy || !name.trim()}>
          Add passkey
        </button>
        <p className="muted tiny">Adding a passkey needs one you already have.</p>
      </form>
    </Sheet>
  );
}

/** A secret shown once: the new authenticator key or the new recovery codes. */
function OnceSheet({ shown, onClose }: { shown: ShownOnce | null; onClose: () => void }) {
  return (
    <Sheet open={shown !== null} title={shown?.title ?? ""} onClose={onClose}>
      {shown && (
        <div className="stack">
          <p className="muted small">{shown.message}</p>
          <pre className="card log mono">{shown.lines.join("\n")}</pre>
          <button type="button" className="btn primary sheet-action" onClick={onClose}>
            I've saved it
          </button>
        </div>
      )}
    </Sheet>
  );
}

interface ShownOnce {
  title: string;
  message: string;
  lines: string[];
}

/** One device row; the device in use can't sign itself out. */
function DeviceRow({ device, onSignOut }: { device: Device; onSignOut: () => void }) {
  const out = { label: "Sign out", icon: LogOut, tone: "clay" as const, onSelect: onSignOut };
  return (
    <ActionRow
      title={device.name}
      meta={device.meta}
      status={device.current ? { status: "healthy", label: "This device" } : null}
      end={device.current ? undefined : out}
      more={device.current ? undefined : [{ ...out, destructive: true }]}
    />
  );
}

/** Credential rows: the authenticator and the recovery codes, each replaced with the passkey. */
function CredentialRows({
  security,
  onShow,
}: {
  security: SecurityOverview;
  onShow: (s: ShownOnce) => void;
}) {
  const totp = useSecurityPost<TotpReset>();
  const codes = useSecurityPost<RecoveryCodes>();
  const reset = async () => {
    const made = await totp.post("totp/reset");
    if (made)
      onShow({ title: "New authenticator key", message: made.message, lines: [made.setup_key] });
  };
  const renew = async () => {
    const made = await codes.post("recovery-codes");
    if (made) onShow({ title: "New recovery codes", message: made.message, lines: made.codes });
  };
  const resetAction = { label: "Reset", icon: RotateCcw, onSelect: () => void reset() };
  const renewAction = { label: "New codes", icon: KeyRound, onSelect: () => void renew() };
  return (
    <>
      <ActionRow
        title="Discord authenticator"
        meta={security.totp}
        start={resetAction}
        more={[resetAction]}
      />
      <ActionRow
        title="Recovery codes"
        meta={security.recovery}
        start={renewAction}
        more={[renewAction]}
      />
    </>
  );
}

/** Devices signed in, passkeys, the authenticator and recovery codes. */
export function SignIn({ security }: { security: SecurityOverview }) {
  const { post } = useSecurityPost<SecurityResult>();
  const [adding, setAdding] = useState(false);
  const [shown, setShown] = useState<ShownOnce | null>(null);
  const add = (
    <button type="button" className="btn compact" onClick={() => setAdding(true)}>
      <Plus size={16} aria-hidden="true" /> Add a passkey
    </button>
  );
  return (
    <Section title="Sign-in" aside={add}>
      <div className="list">
        {security.devices.map((device) => (
          <DeviceRow
            key={device.id}
            device={device}
            onSignOut={() => void post(`devices/${device.id}/sign-out`)}
          />
        ))}
        {security.passkeys.map((key) => {
          const remove = {
            label: "Remove",
            icon: Trash2,
            tone: "clay" as const,
            onSelect: () => void post(`passkeys/${key.id}/remove`),
          };
          return (
            <ActionRow
              key={key.id}
              title={`Passkey · ${key.name}`}
              meta={key.meta}
              end={remove}
              more={[{ ...remove, destructive: true }]}
            />
          );
        })}
        <CredentialRows security={security} onShow={setShown} />
      </div>
      <PasskeySheet open={adding} onClose={() => setAdding(false)} />
      <OnceSheet shown={shown} onClose={() => setShown(null)} />
    </Section>
  );
}

type Range = "today" | "7d" | "30d";

/** Saves the exported lines as a text file on this device. */
function download(made: AuditExport) {
  const url = URL.createObjectURL(new Blob([made.lines.join("\n")], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = made.filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** The masked audit log, with a range and filter to export. */
export function AuditLog({ security }: { security: SecurityOverview }) {
  const [range, setRange] = useState<Range>("today");
  const [filter, setFilter] = useState("");
  const { post, busy } = useSecurityPost<AuditExport>();
  const exportRange = async () => {
    const made = await post("audit/export", { range, filter });
    if (made) download(made);
  };
  return (
    <Section title="Audit log" aside={security.chain}>
      <div className="stack">
        <div className="row wrap" style={GAP}>
          <Segmented
            label="Range"
            value={range}
            options={[
              { value: "today", label: "Today" },
              { value: "7d", label: "7 days" },
              { value: "30d", label: "30 days" },
            ]}
            onChange={setRange}
          />
          <input
            className="field grow"
            aria-label="Filter"
            placeholder="Filter, such as denied"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <button
            type="button"
            className="btn compact"
            disabled={busy}
            onClick={() => void exportRange()}
          >
            <Download size={16} aria-hidden="true" /> Export
          </button>
        </div>
        <pre className="card log mono tiny">{security.audit.join("\n")}</pre>
      </div>
    </Section>
  );
}

/** The allowlisted contacts; each opens Contacts, and Remove lowers it to known in one tap. */
export function Allowlist({ rows }: { rows: Row[] }) {
  const { run } = useAction({
    refresh: ["security", "contacts"],
    done: () => "Removed from the allowlist",
  });
  const add = (
    <Link to="/contacts" className="btn compact">
      <Plus size={16} aria-hidden="true" /> Add in Contacts
    </Link>
  );
  return (
    <Section title="Allowlist" aside={add}>
      {rows.length === 0 ? (
        <p className="list empty">No one is allowlisted.</p>
      ) : (
        <div className="list">
          {rows.map((row) => {
            const remove = {
              label: "Remove",
              icon: UserMinus,
              tone: "clay" as const,
              onSelect: () =>
                void run((proof) =>
                  send("PUT", `/contacts/${row.id}/trust`, { trust: "known" }, proof),
                ),
            };
            return (
              <ActionRow
                key={row.id}
                title={row.title}
                meta={row.meta}
                href={row.href}
                end={remove}
                more={[{ ...remove, destructive: true }]}
              />
            );
          })}
        </div>
      )}
    </Section>
  );
}
