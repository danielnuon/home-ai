/**
 * @file The preview's HTTP surface: the same paths, bodies, statuses and error shapes as the
 * server's routes (`routes/*.py`), answered from the in-page mock backends. Routes only translate
 * requests to backend calls, as on the server; every rule lives in the backend modules.
 */
import * as board from "./board";
import * as engine from "./engine";
import { MockError, notFound } from "./errors";
import * as gate from "./gate";
import * as chat from "./chat";
import * as memory from "./memory";
import * as shell from "./shell";
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
const convo = (call: Call) => ({ lead: p(call, "id"), thread: p(call, "thread") });
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
  "/work": (w) => board.workBoard(w),
  "/work-items/:id": (w, c) => board.itemDetail(w, p(c, "id")),
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
  "/chat/:id": (w, c) => chat.chatThread(w, p(c, "id"), c.query.get("thread")),
  "/memory": (w) => memory.memoryOverview(w),
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
  "/docs/:id": (w, c) => shell.docPage(w, p(c, "id")),
  "/trash": (w) => shell.trash(w),
  "/offline-pack": (w) => shell.offlinePack(w),
  "/library": (w) => shell.library(w),
  "/library/search": (w, c) => shell.librarySearch(w, c.query.get("q") ?? ""),
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
  "/threads/:id/move": (w, c) => board.moveThread(w, p(c, "id"), str(c.body.lead_id)),
  "/ideas": (w, c) => board.submitIdea(w, str(c.body.title), str(c.body.summary)),
  "/ideas/:id/withdraw": (w, c) => board.withdrawIdea(w, p(c, "id")),
  "/ideas/:id/reopen": (w, c) => board.reopenIdea(w, p(c, "id")),
  "/products/:id/retire": (w, c) => board.retireProduct(w, p(c, "id")),
  "/directory/role-suggestions": (w, c) =>
    board.suggestRole(w, str(c.body.title), str(c.body.reason)),
  "/proposals/:id/decision": (w, c) => {
    gate.decideProposal(w, p(c, "id"), str(c.body.decision));
    return NO_CONTENT;
  },
  "/cases/:id/action": (w, c) => engine.caseAction(w, p(c, "id"), str(c.body.action)),
  "/changes/:id/undo": (w, c) => engine.undoChange(w, p(c, "id")),
  "/setup/:id": (w, c) => engine.setupAction(w, p(c, "id"), str(c.body.action)),
  "/chat/:id": (w, c) =>
    chat.chatSend(
      w,
      p(c, "id"),
      str(c.body.text),
      typeof c.body.thread_id === "string" ? c.body.thread_id : null,
      c.body.temporary === true,
    ),
  "/chat/:id/:thread/keep": (w, c) => chat.chatKeep(w, convo(c)),
  "/chat/:id/:thread/messages/:message/remember": (w, c) =>
    chat.chatRemember(w, convo(c), p(c, "message")),
  "/memory": (w, c) =>
    memory.memoryAdd(w, str(c.body.text), c.body.kind === "note" ? "note" : "avoid"),
  "/memory/:id/forget": (w, c) => memory.memoryForget(w, p(c, "id")),
  "/memory/:id/restore": (w, c) => memory.memoryRestore(w, p(c, "id")),
  "/memory/:id/confirm": (w, c) => memory.memoryConfirm(w, p(c, "id")),
  "/memory/:id/dismiss": (w, c) => memory.memoryDismiss(w, p(c, "id")),
  "/chat/:id/:thread/stop": (w, c) => chat.chatStop(w, convo(c)),
  "/chat/:id/:thread/messages/:message/edit": (w, c) =>
    chat.chatEdit(w, convo(c), p(c, "message"), str(c.body.text)),
  "/chat/:id/:thread/messages/:message/regenerate": (w, c) =>
    chat.chatRegenerate(w, convo(c), p(c, "message")),
  "/chat/:id/:thread/messages/:message/switch": (w, c) =>
    chat.chatSwitch(w, convo(c), p(c, "message")),
  "/chat/:id/:thread/messages/:message/branch": (w, c) =>
    chat.chatBranch(w, convo(c), p(c, "message")),
  "/schedule/:id/run": (w, c) => engine.runJob(w, p(c, "id")),
  "/maintenance/fixes/:id/revert": (w, c) => engine.toggleFixReverted(w, p(c, "id")),
  "/guide/ask": (w, c) =>
    shell.guideAsk(
      w,
      str(c.body.question),
      str(c.body.page),
      typeof c.body.context === "string" ? c.body.context : null,
    ),
  "/docs/:id/change-requests": (w, c) => shell.requestDocChange(w, p(c, "id"), str(c.body.text)),
  "/alerts/:id/action": (w, c) => shell.alertAction(w, p(c, "id"), str(c.body.action)),
  "/trash/:id/restore": (w, c) => shell.restoreFromTrash(w, p(c, "id")),
  "/trash/:id/purge": (w, c) => {
    shell.purgeFromTrash(w, p(c, "id"));
    return NO_CONTENT;
  },
  "/library/ask": (w, c) => shell.libraryAsk(w, str(c.body.question)),
  "/library/ark-drive": (w, c) => shell.writeArkDrive(w, str(c.body.volume), c.stepUp),
};

const priority = (call: Call) => str(call.body.priority) as "normal";

const PUT: Record<string, Handler> = {
  "/ideas/:id": (w, c) => board.editIdea(w, p(c, "id"), str(c.body.title), str(c.body.summary)),
  "/ideas/:id/paused": (w, c) => board.setIdeaPaused(w, p(c, "id"), c.body.paused === true),
  "/ideas/:id/priority": (w, c) => board.setIdeaPriority(w, p(c, "id"), priority(c)),
  "/work-items/:id/paused": (w, c) => board.setItemPaused(w, p(c, "id"), c.body.paused === true),
  "/work-items/:id/priority": (w, c) => board.setItemPriority(w, p(c, "id"), priority(c)),
  "/settings/:key": (w, c) => gate.changeSetting(w, p(c, "key"), str(c.body.value), c.stepUp),
  "/contacts/:id/trust": (w, c) =>
    gate.setTrust(w, p(c, "id"), str(c.body.trust) as "known", c.stepUp),
  "/directory/:id/enabled": (w, c) => {
    gate.setEmployeeEnabled(w, p(c, "id"), c.body.enabled === true, c.stepUp);
    return NO_CONTENT;
  },
  "/schedule/:id/paused": (w, c) => engine.setJobPaused(w, p(c, "id"), c.body.paused === true),
  "/maintenance/running": (w, c) => engine.setMaintenanceRunning(w, c.body.running === true),
  "/memory/paused": (w, c) => memory.memoryPause(w, c.body.paused === true),
  "/memory/:id": (w, c) =>
    memory.memoryEdit(w, p(c, "id"), {
      text: typeof c.body.text === "string" ? c.body.text : null,
      pinned: typeof c.body.pinned === "boolean" ? c.body.pinned : null,
    }),
  "/chat/:id/:thread/learning": (w, c) => chat.chatLearning(w, convo(c), c.body.learning === true),
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
