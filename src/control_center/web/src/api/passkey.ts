/**
 * @file The passkey step-up (spec 7.4): proves the Owner is present before a loosening change.
 *
 * The server issues a one-time challenge, the authenticator signs it, and the server answers with
 * a short-lived, single-use proof that rides along on the gated request in `X-Step-Up`.
 *
 * Until the hardware arrives the server runs a virtual authenticator, so `signChallenge` answers
 * the way that authenticator expects. When the real gate lands, this is the one function to swap
 * for `navigator.credentials.get({ publicKey: ... })`; nothing that calls it changes.
 */
import { send } from "./client";
import type { StepUpProof } from "./types";

/** Matches `MOCK_ASSERTION_PREFIX` in the server's mock gate. */
const VIRTUAL_AUTHENTICATOR_PREFIX = "virtual:";

/** Signs a challenge. Mock only: see the file comment for where WebAuthn plugs in. */
function signChallenge(challenge: string): Promise<string> {
  return Promise.resolve(VIRTUAL_AUTHENTICATOR_PREFIX + challenge);
}

/** Runs one challenge-and-verify round and returns the proof for the next gated request. */
export async function stepUp(): Promise<string> {
  const { challenge } = await send<{ challenge: string }>("POST", "/step-up/challenge");
  const assertion = await signChallenge(challenge);
  const proof = await send<StepUpProof>("POST", "/step-up/verify", { challenge, assertion });
  return proof.proof;
}
