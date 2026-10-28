/**
 * @file The one place the front end talks HTTP to Brain's server.
 *
 * Adds the session's CSRF token to every state-changing request (spec 7.1, principle 6), passes a
 * step-up proof when one is given, and turns error answers into `ApiError`s carrying the reason the
 * server wrote for the Owner.
 */

const CSRF_HEADER = "X-CSRF-Token";
const STEP_UP_HEADER = "X-Step-Up";

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

/** Opens the session once and remembers its CSRF token for the life of the page. */
function sessionToken(): Promise<string> {
  csrfToken ??= fetch("/api/session", { credentials: "same-origin" })
    .then((response) => response.json() as Promise<{ csrf_token: string }>)
    .then((session) => session.csrf_token);
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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    [CSRF_HEADER]: await sessionToken(),
  };
  if (stepUp) {
    headers[STEP_UP_HEADER] = stepUp;
  }
  const response = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
