/**
 * @file Export your data: everything, or one person's (spec 7.2, Settings). The export carries
 * private data out of Brain, so the gate asks for the passkey.
 */
import { Download } from "lucide-react";
import { useState } from "react";
import { useAction } from "../../api/actions";
import { send } from "../../api/client";
import type { ExportStarted } from "../../api/types";
import { Segmented } from "../../components/Controls";
import { Sheet } from "../../components/Sheet";

type Scope = "all" | "owner" | "mom" | "dad";

const SCOPES: { value: Scope; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "owner", label: "You" },
  { value: "mom", label: "Mom" },
  { value: "dad", label: "Dad" },
];

/** The row that opens the export sheet, and the sheet. */
export function ExportData() {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("all");
  const { run, busy } = useAction<ExportStarted>({ done: (r) => r.message });
  const start = async () => {
    const done = await run((proof) => send<ExportStarted>("POST", "/exports", { scope }, proof));
    if (done) setOpen(false);
  };
  return (
    <>
      <button type="button" className="list-row" onClick={() => setOpen(true)}>
        <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
          <span className="row-title">Export your data</span>
          <span className="muted small">Everything, or one person's, as an archive</span>
        </span>
        <Download size={16} className="muted" aria-hidden="true" />
      </button>
      <Sheet open={open} title="Export your data" onClose={() => setOpen(false)}>
        <div className="stack">
          <Segmented label="Whose data" value={scope} options={SCOPES} onChange={setScope} />
          <button
            type="button"
            className="btn primary sheet-action"
            disabled={busy}
            onClick={() => void start()}
          >
            Start export
          </button>
          <p className="muted tiny">Exporting needs your passkey. The archive stays on the Mac.</p>
        </div>
      </Sheet>
    </>
  );
}
