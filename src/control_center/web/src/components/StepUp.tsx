/**
 * @file The passkey prompt that stands between the Owner and any loosening change (spec 7.16,
 * rule 3).
 *
 * Callers ask for a proof with the server's reason ("Raising the cloud cap needs your passkey").
 * The sheet explains what is being unlocked, runs the passkey round on a tap, and hands back the
 * proof, or null if the Owner backs out. Tightening never comes here.
 */
import { KeyRound } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { stepUp } from "../api/passkey";
import { Sheet } from "./Sheet";

type RequestProof = (reason: string) => Promise<string | null>;

const StepUpContext = createContext<RequestProof>(() => Promise.resolve(null));

/** Asks the Owner for a passkey step-up. Resolves with a proof, or null if they cancel. */
export const useStepUp = () => useContext(StepUpContext);

/** Renders the step-up sheet when something asks for a proof. */
export function StepUpProvider({ children }: { children: ReactNode }) {
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const settle = useRef<(proof: string | null) => void>(() => undefined);

  const request = useCallback<RequestProof>((why) => {
    setReason(why);
    setFailed(false);
    return new Promise((resolve) => (settle.current = resolve));
  }, []);

  const finish = (proof: string | null) => {
    settle.current(proof);
    setReason(null);
  };

  const confirm = async () => {
    setBusy(true);
    try {
      finish(await stepUp());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepUpContext.Provider value={request}>
      {children}
      <Sheet open={reason !== null} title="Confirm it's you" onClose={() => finish(null)}>
        <div className="stack">
          <p>{reason}</p>
          <p className="muted small">
            Loosening a limit needs your passkey. Tightening never does, so you can always make
            things safer with one tap.
          </p>
          {failed && <p className="status-problem">▲ The passkey didn't go through. Try again.</p>}
          <button type="button" className="btn primary" disabled={busy} onClick={confirm}>
            <KeyRound size={18} aria-hidden="true" />
            Use passkey
          </button>
          <button type="button" className="btn ghost" onClick={() => finish(null)}>
            Cancel
          </button>
        </div>
      </Sheet>
    </StepUpContext.Provider>
  );
}
