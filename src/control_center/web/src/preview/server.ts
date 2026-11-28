/**
 * @file The preview's HTTP surface: the same paths, bodies, statuses and error shapes as the
 * server's routes (`routes/*.py`), answered from the in-page mock backends. Routes only translate
 * requests to backend calls, as on the server; every rule lives in the backend modules.
 */
import * as accounts from "./accounts";
import * as engine from "./engine";
import { MockError } from "./errors";
import * as gate from "./gate";
import * as people from "./people";
import * as records from "./records";
import * as chat from "./chat";
import * as memory from "./memory";
import * as ops from "./ops";
import * as shell from "./shell";
import * as status from "./status";
import { buildToday } from "./today";
import * as work from "./work";
import type { MockWorld } from "./world";
import type { components } from "../api/schema";

/** One request as a route sees it. */
interface Call {
  params: Record<string, string>;
  body: Record<string, unknown>;
  query: URLSearchParams;
  stepUp: string | null;
}

type Handler = (world: MockWorld, call: Call) => unknown;

const NO_CONTENT = Symbol("no content");

/** Runs an action, then answers with the page it changed, as the server's route does. */
const then = (world: MockWorld, act: (w: MockWorld) => void, page: (w: MockWorld) => unknown) => {
  act(world);
  return page(world);
};

const str = (value: unknown) => (typeof value === "string" ? value : "");
const list = (value: unknown) =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
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
  "/contacts": (w) => people.contactsOverview(w),
  "/contacts/:id": (w, c) => people.contactDetail(w, p(c, "id")),
  "/live": (w) => work.liveTasks(w),
  "/live/:id": (w, c) => work.taskDetail(w, p(c, "id")),
  "/work": (w) => work.workBoard(w),
  "/directory": (w) => work.directory(w),
  "/today": (w) => buildToday(w),
  "/personal": (w) => records.personal(w),
  "/finance/:who": (w, c) => records.finance(w, p(c, "who")),
  "/finance/:who/sources/:figure": (w, c) => records.figureSources(w, p(c, "who"), p(c, "figure")),
  "/domains/:id": (w, c) => records.domainDetail(w, p(c, "id")),
  "/setup": (w) => Object.values(w.setup),
  "/search": (w, c) => engine.search(w, c.query.get("q") ?? ""),
  "/chat/:id": (w, c) => chat.chatThread(w, p(c, "id"), c.query.get("thread")),
  "/memory": (w) => memory.memoryOverview(w),
  "/system": (w) => status.system(w),
  "/services": (w) => status.services(w),
  "/models": (w) => status.models(w),
  "/spend": (w) => status.spend(w),
  "/schedule": (w) => engine.schedule(w),
  "/security": (w) => accounts.security(w),
  "/backups": (w) => status.backups(w),
  "/maintenance": (w) => engine.maintenance(w),
  "/connections": (w) => accounts.connections(w),
  "/voice": (w) => accounts.voice(w),
  "/settings/:key/impact": (w, c) =>
    accounts.settingImpact(w, p(c, "key"), c.query.get("value") ?? ""),
  "/settings/:key/outcomes": (w, c) => accounts.settingOutcomes(w, p(c, "key")),
  "/docs": (w) => ({ groups: w.fixtures.doc_groups }),
  "/docs/:id": (w, c) => shell.docPage(w, p(c, "id")),
  "/trash": (w) => shell.trash(w),
  "/offline-pack": (w) => shell.offlinePack(w),
  "/library": (w) => shell.library(w),
  "/library/search": (w, c) => shell.librarySearch(w, c.query.get("q") ?? ""),
  "/services/:id/logs": (w, c) => ops.serviceLog(w, p(c, "id")),
  "/metrics": (w, c) => ops.metrics(w, c.query.get("page") ?? "settings"),
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
  "/approvals/:id/allow-recipient": (w, c) => gate.allowRecipient(w, p(c, "id"), c.stepUp),
  "/contacts": (w, c) => people.addContact(w, c.body, c.stepUp),
  "/contacts/:id/merge": (w, c) => people.mergeContact(w, p(c, "id"), str(c.body.into)),
  "/contacts/:id/remove": (w, c) => people.removeContact(w, p(c, "id")),
  "/principals": (w, c) => people.addPrincipal(w, str(c.body.name), c.stepUp),
  "/principals/:id/remove": (w, c) =>
    people.removePrincipal(w, p(c, "id"), str(c.body.keep), c.stepUp),
  "/principals/:id/undo-remove": (w, c) => people.undoRemovePrincipal(w, p(c, "id")),
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
  "/cases": (w, c) => records.createCase(w, c.body),
  "/cases/:id/reassign": (w, c) => records.reassignCase(w, p(c, "id"), str(c.body.employee_name)),
  "/cases/:id/notes": (w, c) => records.addCaseNote(w, p(c, "id"), str(c.body.text)),
  "/obligations": (w, c) => records.createObligation(w, c.body),
  "/domains/:id/records": (w, c) => records.addRecord(w, p(c, "id"), c.body),
  "/domains/:id/documents": (w, c) => records.uploadDocument(w, p(c, "id"), c.body),
  "/finance/:who/transactions/:id/category": (w, c) =>
    records.fixCategory(w, p(c, "who"), p(c, "id"), str(c.body.category)),
  "/finance/:who/imports/:id/upload": (w, c) =>
    records.uploadStatement(w, p(c, "who"), p(c, "id"), c.body),
  "/finance/accounts/:id/map": (w, c) => records.mapAccount(w, p(c, "id"), str(c.body.principal)),
  "/finance/:who/requests": (w, c) => records.financeRequest(w, p(c, "who"), str(c.body.kind)),
  "/setup/:id/secrets/:field": (w, c) =>
    records.saveSetupSecret(w, p(c, "id"), p(c, "field"), str(c.body.value), c.stepUp),
  "/setup/:id/interview/answer": (w, c) => records.interviewAnswer(w, p(c, "id"), str(c.body.text)),
  "/setup/:id/interview/confirm": (w, c) => records.interviewConfirm(w, p(c, "id")),
  "/setup/:id/interview/restart": (w, c) => records.interviewRestart(w, p(c, "id")),
  "/library/ask": (w, c) => shell.libraryAsk(w, str(c.body.question)),
  "/library/ark-drive": (w, c) => shell.writeArkDrive(w, str(c.body.volume), c.stepUp),
  "/system/pool-mode/end": (w) => then(w, ops.endPoolMode, status.system),
  "/system/health-check": (w) => then(w, ops.runHealthCheck, status.system),
  "/system/pressure-drill": (w) => then(w, ops.pressureDrill, status.system),
  "/models/selection": (w) => then(w, ops.runSelection, status.models),
  "/backups/drill": (w) => then(w, ops.runRestoreDrill, status.backups),
  "/backups/prune-plan": (w) => then(w, ops.makePrunePlan, status.backups),
  "/backups/prune-plan/discard": (w) => then(w, ops.discardPrunePlan, status.backups),
  "/backups/prune": (w, c) => gate.runPrune(w, str(c.body.plan_id), c.stepUp),
  "/maintenance/findings/:id/wont-fix": (w, c) => ops.wontFix(w, p(c, "id"), str(c.body.reason)),
  "/maintenance/findings/:id/reopen": (w, c) => ops.reopenFinding(w, p(c, "id")),
  "/connections/:id/connect": (w, c) => accounts.connect(w, p(c, "id"), c.stepUp),
  "/connections/:id/disconnect": (w, c) => accounts.disconnect(w, p(c, "id")),
  "/connections/:id/secret/remove": (w, c) => accounts.removeSecret(w, p(c, "id")),
  "/connections/:id/permission": (w, c) => accounts.askPermission(w, p(c, "id")),
  "/connections/:id/test": (w, c) => accounts.testConnection(w, p(c, "id")),
  "/voice/profiles": (w, c) =>
    accounts.addVoiceProfile(w, c.body as components["schemas"]["NewVoiceProfile"], c.stepUp),
  "/voice/profiles/:id/render": (w, c) => accounts.renderVoiceProfile(w, p(c, "id")),
  "/voice/profiles/:id/preview": (w, c) => accounts.previewVoiceProfile(w, p(c, "id")),
  "/voice/profiles/:id/delete": (w, c) => {
    accounts.deleteVoiceProfile(w, p(c, "id"));
    return NO_CONTENT;
  },
  "/security/workspaces/:id/stop": (w, c) => accounts.stopWorkspace(w, p(c, "id")),
  "/security/workspaces/:id/resume": (w, c) => accounts.resumeWorkspace(w, p(c, "id"), c.stepUp),
  "/security/devices/:id/sign-out": (w, c) => accounts.signOutDevice(w, p(c, "id")),
  "/security/passkeys": (w, c) => accounts.addPasskey(w, str(c.body.name), c.stepUp),
  "/security/passkeys/:id/remove": (w, c) => accounts.removePasskey(w, p(c, "id"), c.stepUp),
  "/security/totp/reset": (w, c) => accounts.resetTotp(w, c.stepUp),
  "/security/recovery-codes": (w, c) => accounts.regenerateRecoveryCodes(w, c.stepUp),
  "/security/audit/export": (w, c) =>
    accounts.exportAudit(
      w,
      typeof c.body.range === "string" ? c.body.range : "today",
      str(c.body.filter),
    ),
  "/exports": (w, c) => accounts.exportData(w, str(c.body.scope), c.stepUp),
};

const PUT: Record<string, Handler> = {
  "/settings/:key": (w, c) => gate.changeSetting(w, p(c, "key"), str(c.body.value), c.stepUp),
  "/contacts/:id": (w, c) => people.editContact(w, p(c, "id"), c.body, c.stepUp),
  "/contacts/:id/trust": (w, c) =>
    people.setTrust(w, p(c, "id"), str(c.body.trust) as "known", c.stepUp),
  "/principals/:id/accounts": (w, c) =>
    people.mapPrincipal(w, p(c, "id"), list(c.body.accounts), list(c.body.calendars), c.stepUp),
  "/approvals/:id/draft": (w, c) => gate.editDraft(w, p(c, "id"), str(c.body.draft)),
  "/approvals/:id/batch/:message": (w, c) =>
    gate.toggleBatchMessage(w, p(c, "id"), p(c, "message"), c.body.included === true),
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
  "/connections/:id/secret": (w, c) =>
    accounts.setSecret(w, p(c, "id"), str(c.body.value), c.stepUp),
  "/chat/:id/:thread/learning": (w, c) => chat.chatLearning(w, convo(c), c.body.learning === true),
  "/checklist/:id": (w, c) => records.setChecklist(w, p(c, "id"), c.body.done === true),
  "/records/:id": (w, c) => records.editRecord(w, p(c, "id"), str(c.body.title), str(c.body.meta)),
  "/rules/:id": (w, c) => records.editRule(w, p(c, "id"), str(c.body.when), str(c.body.then)),
  "/system/pool-mode": (w, c) =>
    then(w, (world) => ops.setPoolMode(world, str(c.body.mode)), status.system),
  "/models/families/:family/pin": (w, c) =>
    then(w, (world) => ops.pinFamily(world, p(c, "family"), c.body.pinned === true), status.models),
  "/schedule/:id/time": (w, c) => ops.setJobTime(w, p(c, "id"), str(c.body.time)),
};

const DELETE: Record<string, Handler> = {
  "/records/:id": (w, c) => records.deleteRecord(w, p(c, "id")),
  "/rules/:id": (w, c) => records.deleteRule(w, p(c, "id")),
};

const TABLES: Record<string, Record<string, Handler>> = { GET, POST, PUT, DELETE };

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
