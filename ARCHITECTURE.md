---
id: DESIGN-0001
title: "Brain architecture"
type: design
status: approved
owner_role: ARC-1
approver: owner
created: 2026-10-28
last_reviewed: 2026-10-29
review_cadence_days: 180
risk_class: R1
work_item: null      # built before the work-item system exists
supersedes: []
covers: [src/control_center/**]
data_class: internal
---

# Architecture

Brain is a FastAPI server and a React app. The server owns no rules of its own: it translates
HTTP into calls on four backend interfaces and streams their events to the browser. The rules
(who may do what, what needs a passkey, what can never happen) live behind those interfaces, in
the approval gate, so Brain and Discord behave identically (spec 7.1, principle 3).

```
Browser (React)                    Brain server (FastAPI, 127.0.0.1:8406)        Backends
───────────────                    ──────────────────────────────────────        ────────
pages ── queries.ts ─ GET /api/v1/* ▶ routes/*  ──▶ ApprovalGate     ──▶ mock today,
      ── actions.ts ── POST/PUT ───▶  (no rules)  PipelineEngine        real services
      ◀─ events.ts ◀── SSE /api/v1/events ◀────── StatusAggregator      later (24.1)
                                                  ChatRelay
                                                  EventBus (fan-out, replay)
```

## Server: `src/control_center/`

| Path | What it is |
| --- | --- |
| `__main__.py` | `python -m control_center`: loads the config and runs uvicorn on 127.0.0.1:8406 |
| `app.py` | Builds the app: security middleware, routers, error mapping, `/health`, static files |
| `config.py` | Reads `BRAIN_*` variables and refuses unsafe combinations at start-up; the Owner's time zone |
| `security.py` | Owner identity (`Tailscale-User-Login`), CSRF (an expired session answers `session_expired`), Content Security Policy |
| `events.py` | The event bus: publish, replay from `Last-Event-ID` (a restart or a gap means "refetch everything"), fan-out to SSE clients |
| `today.py` | Composes Today from the four backends in one response. It holds no figures of its own: tiles and metrics come from `StatusAggregator` |
| `contract/` | Pydantic models for every request and response. The front end's types are generated from these. `version.py` holds the API and event versions |
| `backends/protocols.py` | The four interfaces from spec 6.2, and `Backends`, the bundle of them every route receives |
| `backends/errors.py` | Not found, step-up required, conflict, refused; `app.py` maps them to 404, 403, 409, 422 |
| `backends/mock/` | The mock implementations over one shared `MockWorld`, plus `activity.py`, which keeps the team "working". The gate is `gate.py` plus `gate_step_up.py`, `gate_decisions.py` and `gate_controls.py` |
| `routes/` | One module per area. Each handler is a single backend call |
| `wiring.py` | The only file that names the mocks |

### Swapping in a real backend

Write a class that satisfies the protocol (for example `ApprovalGate`), raise the errors in
`backends/errors.py`, publish `changed` events on the bus when state changes, and construct it in
`wiring.py` in place of the mock. `mypy --strict` checks the protocol match. The rules the mock
applies to settings are in `backends/mock/setting_rules.py` with their own tests, so the real gate
can be held to the same cases.

### Built to change (spec 1.2 rule 8; 17.18, design practice 8)

- **One seam per dependency, checked in `make lint`.** On the server, import-linter contracts in
  `pyproject.toml` keep the routes, Today and the contract from importing the mocks: backends are
  reached through `backends/protocols.py`, and only `wiring.py` and `app.py` name an
  implementation. On the front end, ESLint allows `motion/react` only in `src/design/motion.ts`,
  `three` only in `src/components/ActivityField.tsx`, and `fetch` and `EventSource` only in
  `src/api/`. When a real backend brings a vendor SDK, add a `forbidden` contract that names it
  and its adapter module in the same change.
- **Versioned API and events.** The API is mounted at `/api/v1` and the event stream's `hello`
  frame carries `events_version`; both numbers are in `contract/version.py`, which also says
  when to raise one and what a raise must ship with. A front end that meets another events
  version refetches instead of patching its cache.

### Safety rules, and where each is enforced

- **Tightening is one tap, loosening needs a passkey** (7.16 rule 3): the gate decides direction
  and raises `StepUpRequiredError`; the API answers 403 `step_up_required` with a reason; the
  front end's `useAction` shows the passkey sheet and retries with the proof in `X-Step-Up`.
  Proofs are single-use and last two minutes.
- **Hard limits are refused** whatever proof comes with them (422 `refused`).
- **Approvals wait, decisions count down** (rule 8): an approval never approves on timeout and has
  an 8-second undo; a critical decision shows its window and offers Veto.
- **Owner only**: every `/api` request needs the Owner's tailnet login (or the loopback-only dev
  identity) and every state change needs the session's CSRF token.

## Front end: `src/control_center/web/`

| Path | What it is |
| --- | --- |
| `src/api/client.ts` | The only `fetch` caller: CSRF, step-up header, error reasons |
| `src/api/queries.ts` | One read hook per resource. Query key `[0]` equals the server's resource name |
| `src/api/actions.ts` | `useAction`: run a change, step up if asked, toast the result or the reason |
| `src/api/events.ts` | The SSE subscription: refetches on `changed`, patches token rates, transcripts and chat in place, and refetches everything when `hello` names a different server run |
| `src/api/passkey.ts` | The step-up round. `signChallenge` is where real WebAuthn replaces the virtual authenticator |
| `src/api/schema.d.ts` | Generated by `make types`. Never edit |
| `src/design/` | Still Water tokens and base patterns (7.12), status words, layout hook, and `motion.ts`, the only module that imports the animation library |
| `src/components/` | Shared pieces: sheet, toasts, step-up, avatar, activity field, cards, setting control |
| `src/shell/` | Sidebar, rail and tab bar for the three layouts; global banners; Stop control |
| `src/pages/` | One file per page, loaded lazily |
| `src/routes.tsx` | Every page with its path, label, icon and badge, in sidebar order |

Data is pushed, not polled: queries never go stale on their own, and the event stream decides
what to refetch. Pages load lazily, and three.js (the activity field) loads only on Today and
Live, which keeps the initial JavaScript at about 160 KB gzipped against a 250 KB budget
(`pnpm size` enforces it). The animation engine is in that initial bundle on purpose: the passkey
and veto sheets must not depend on a second request.

## What is not built yet

- Real WebAuthn (the server runs a virtual authenticator; see `api/passkey.ts`).
- GSAP morphs and the WebGPU renderer from 7.14; motion uses Motion for React and three.js WebGL.
- Statement uploads, connection flows and adding contacts or principals, which need services
  that do not exist yet. Their buttons are present and disabled or link to where they will live.
- Persistent sessions (sessions are in memory; a restart costs one extra request).
