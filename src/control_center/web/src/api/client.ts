/**
 * @file The one place the front end talks HTTP to Brain's server.
 *
 * Adds the session's CSRF token to every state-changing request (spec 7.1, principle 6), passes a
 * step-up proof when one is given, and turns error answers into `ApiError`s carrying the reason the
 * server wrote for the Owner.
 */

const CSRF_HEADER = "X-CSRF-Token";
const STEP_UP_HEADER = "X-Step-Up";
/** The error code the server's CSRF check answers with (`security.py`). */
const SESSION_EXPIRED = "session_expired";

/** An error answer from the server. `code` is "step_up_required" when a passkey is needed. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly reason: string,
  ) {
    super(reason);
  }
}

let csrfToken: Promise<string> | null = null;

/**
 * Opens the session once and remembers its CSRF token. A failed open is forgotten, so the next
 * write tries again instead of reusing the failure for the life of the page.
 */
function sessionToken(): Promise<string> {
  csrfToken ??= fetch("/api/session", { credentials: "same-origin" })
    .then(async (response) => {
      if (!response.ok) throw await toApiError(response);
      return ((await response.json()) as { csrf_token: string }).csrf_token;
    })
    .catch((error: unknown) => {
      csrfToken = null;
      throw error;
    });
  return csrfToken;
}

/** Reads the server's error body, which is `{error, reason}` from Brain or `{detail}` from FastAPI. */
async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    reason?: string;
    detail?: unknown;
  };
  const reason =
    body.reason ?? (typeof body.detail === "string" ? body.detail : "Something went wrong.");
  return new ApiError(response.status, body.error ?? "error", reason);
}

/** GETs a JSON resource. */
export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`, { credentials: "same-origin" });
  if (!response.ok) {
    throw await toApiError(response);
  }
  return (await response.json()) as T;
}

/**
 * Sends a state-changing request.
 *
 * @param method - POST or PUT.
 * @param path - Path under `/api`.
 * @param body - JSON body, if any.
 * @param stepUp - A proof from a fresh passkey step-up, for actions the gate gates.
 * @returns The parsed JSON answer, or undefined for 204 No Content.
 */
export async function send<T>(
  method: "POST" | "PUT",
  path: string,
  body?: unknown,
  stepUp?: string,
): Promise<T> {
  const post = async () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      [CSRF_HEADER]: await sessionToken(),
    };
    if (stepUp) {
      headers[STEP_UP_HEADER] = stepUp;
    }
    return fetch(`/api${path}`, {
      method,
      headers,
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };
  let response = await post();
  if (response.status === 403 && (await isSessionRefusal(response))) {
    // The server forgot the session (a restart clears it): open a new one and try once more.
    // The refusal came before the action ran, so retrying cannot do anything twice.
    csrfToken = null;
    response = await post();
  }
  if (!response.ok) {
    throw await toApiError(response);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

/** Whether a 403 is the CSRF check, not a step-up request or the identity check. */
async function isSessionRefusal(response: Response): Promise<boolean> {
  const body = (await response
    .clone()
    .json()
    .catch(() => ({}))) as { error?: string };
  return body.error === SESSION_EXPIRED;
}
