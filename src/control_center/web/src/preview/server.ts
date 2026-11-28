/**
 * @file The preview's HTTP surface: the same paths, bodies, statuses and error shapes as the
 * server's routes (`routes/*.py`), answered from the in-page mock backends. Routes only translate
 * requests to backend calls, as on the server; every rule lives in the backend modules.
 */
import * as engine from "./engine";
import { MockError, notFound } from "./errors";
import * as gate from "./gate";
import { chatSend, chatThread } from "./live";
import * as status from "./status";
import { buildToday } from "./today";
import * as work from "./work";
import type { MockWorld } from "./world";

/** One request as a route sees it. */
interface Call {
  params: Record<string, string>;
  body: Record<string, unknown>;
  query: URLSearchParams;
  stepUp: string | null;
}

type Handler = (world: MockWorld, call: Call) => unknown;

const NO_CONTENT = Symbol("no content");

const str = (value: unknown) => (typeof value === "string" ? value : "");
const p = (call: Call, name: string) => call.params[name] ?? "";
const running = (world: MockWorld) =>
  Object.values(world.tasks).filter((t) => work.sessionState(t) === "running").length;
const platform = (world: MockWorld) => gate.platformState(world, running(world));

const GET: Record<string, Handler> = {
  "/session": () => ({ csrf_token: "preview" }),
  "/platform": platform,
  "/approvals": (w) => gate.listApprovals(w),
  "/decisions": (w) => gate.listDecisions(w),
  "/settings": (w) => ({
    settings: Object.values(w.settings),
    hard_limits: w.fixtures.hard_limits,
  }),
  "/contacts": (w) => ({ household: w.fixtures.household, contacts: Object.values(w.contacts) }),
  "/live": (w) => work.liveTasks(w),
  "/live/:id": (w, c) => work.taskDetail(w, p(c, "id")),
  "/work": (w) => work.workBoard(w),
  "/directory": (w) => work.directory(w),
  "/today": (w) => buildToday(w),
  "/personal": (w) => engine.personal(w),
  "/finance/:who": (w, c) => {
    const found = w.fixtures.finance[p(c, "who")];
    if (!found) throw notFound("Not Found");
    return found;
  },
  "/setup": (w) => Object.values(w.setup),
  "/search": (w, c) => engine.search(w, c.query.get("q") ?? ""),
  "/chat/:id": (w, c) => chatThread(w, p(c, "id"), c.query.get("thread")),
  "/system": (w) => status.system(w),
  "/services": (w) => status.services(w),
  "/models": (w) => status.models(w),
  "/spend": (w) => status.spend(w),
  "/schedule": (w) => engine.schedule(w),
  "/security": (w) => status.security(w),
  "/backups": (w) => status.backups(w),
  "/maintenance": (w) => engine.maintenance(w),
  "/connections": (w) => status.connections(w),
  "/voice": (w) => status.voice(w),
  "/docs": (w) => ({ groups: w.fixtures.doc_groups }),
};

const POST: Record<string, Handler> = {
  "/step-up/challenge": (w) => ({ challenge: gate.createChallenge(w) }),
  "/step-up/verify": (w, c) => gate.verifyStepUp(w, str(c.body.challenge), str(c.body.assertion)),
  "/platform/stop": (w) => {
    gate.stopAll(w);
    return platform(w);
  },
  "/platform/resume": (w, c) => {
    gate.resumeAll(w, c.stepUp);
    return platform(w);
  },
  "/approvals/:id/decision": (w, c) => gate.decide(w, p(c, "id"), str(c.body.decision), c.stepUp),
  "/approvals/:id/undo": (w, c) => gate.undoDecision(w, p(c, "id")),
  "/decisions/:id/acknowledge": (w, c) => gate.acknowledge(w, p(c, "id")),
  "/decisions/:id/veto": (w, c) =>
    gate.veto(w, p(c, "id"), typeof c.body.reason === "string" ? c.body.reason : null),
  "/decisions/:id/reopen": (w, c) => gate.reopenDecision(w, p(c, "id")),
  "/settings/:key/revert": (w, c) => gate.revertSetting(w, p(c, "key"), c.stepUp),
  "/services/:id/restart": (w, c) => {
    gate.restartService(w, p(c, "id"), c.stepUp);
    return NO_CONTENT;
  },
  "/backups/restore": (w, c) => ({
    message: gate.requestRestore(w, str(c.body.what), str(c.body.point), c.stepUp),
  }),
  "/live/:id/interventions": (w, c) =>
    work.intervene(w, p(c, "id"), {
      kind: str(c.body.kind) as "note",
      text: typeof c.body.text === "string" ? c.body.text : null,
    }),
  "/threads/:id/resolve": (w, c) => work.resolveThread(w, p(c, "id")),
  "/threads/:id/reopen": (w, c) => work.reopenThread(w, p(c, "id")),
  "/proposals/:id/decision": (w, c) => {
    gate.decideProposal(w, p(c, "id"), str(c.body.decision));
    return NO_CONTENT;
  },
  "/cases/:id/action": (w, c) => engine.caseAction(w, p(c, "id"), str(c.body.action)),
  "/changes/:id/undo": (w, c) => engine.undoChange(w, p(c, "id")),
  "/setup/:id": (w, c) => engine.setupAction(w, p(c, "id"), str(c.body.action)),
  "/chat/:id": (w, c) =>
    chatSend(
      w,
      p(c, "id"),
      str(c.body.text),
      typeof c.body.thread_id === "string" ? c.body.thread_id : null,
    ),
  "/schedule/:id/run": (w, c) => engine.runJob(w, p(c, "id")),
  "/maintenance/fixes/:id/revert": (w, c) => engine.toggleFixReverted(w, p(c, "id")),
};

const PUT: Record<string, Handler> = {
  "/settings/:key": (w, c) => gate.changeSetting(w, p(c, "key"), str(c.body.value), c.stepUp),
  "/contacts/:id/trust": (w, c) =>
    gate.setTrust(w, p(c, "id"), str(c.body.trust) as "known", c.stepUp),
  "/directory/:id/enabled": (w, c) => {
    gate.setEmployeeEnabled(w, p(c, "id"), c.body.enabled === true, c.stepUp);
    return NO_CONTENT;
  },
  "/schedule/:id/paused": (w, c) => engine.setJobPaused(w, p(c, "id"), c.body.paused === true),
  "/maintenance/running": (w, c) => engine.setMaintenanceRunning(w, c.body.running === true),
};

const TABLES: Record<string, Record<string, Handler>> = { GET, POST, PUT };

/** Finds the route for a path, with its named parts. */
function match(method: string, path: string): [Handler, Record<string, string>] | null {
  const parts = path.split("/");
  for (const [pattern, handler] of Object.entries(TABLES[method] ?? {})) {
    const want = pattern.split("/");
    if (want.length !== parts.length) continue;
    const params: Record<string, string> = {};
    const fits = want.every((piece, i) => {
      const got = decodeURIComponent(parts[i] ?? "");
      if (piece.startsWith(":")) params[piece.slice(1)] = got;
      return piece.startsWith(":") || piece === got;
    });
    if (fits) return [handler, params];
  }
  return null;
}

/** A request to the preview server, as `fetch` would send it. */
export interface MockRequest {
  method: string;
  /** The path under the API base, with any query string. */
  path: string;
  body?: unknown;
  stepUp?: string | null;
}

/** The status and JSON body the server would answer with. */
export interface MockAnswer {
  status: number;
  body: unknown;
}

/** Answers one API request from the mock world. */
export function handle(world: MockWorld, request: MockRequest): MockAnswer {
  const url = new URL(request.path, "http://preview");
  const found = match(request.method, url.pathname);
  if (!found) return { status: 404, body: { detail: "Not Found" } };
  const [handler, params] = found;
  const body = (request.body ?? {}) as Record<string, unknown>;
  try {
    const result = handler(world, {
      params,
      body,
      query: url.searchParams,
      stepUp: request.stepUp ?? null,
    });
    if (result === NO_CONTENT) return { status: 204, body: null };
    // Serialize now, as the server does, so later changes don't reach an answer already sent.
    return { status: 200, body: JSON.parse(JSON.stringify(result)) as unknown };
  } catch (error) {
    if (error instanceof MockError) {
      return { status: error.status, body: { error: error.code, reason: error.reason } };
    }
    throw error;
  }
}
