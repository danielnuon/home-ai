---
id: ADR-0001
title: "Brain's stack, mock backends and generated types"
type: adr
status: accepted
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

# ADR 0001: Brain's stack, mock backends and generated types

## Context

Brain had to be built before the Mac mini and the platform services exist. The spec fixes the
stack (7.6, 21.1, 21.2) and the four backend interfaces (6.2), and asks for code a newcomer can
read (17.18).

## Decision

1. **Stack as specified.** FastAPI with JSON and server-sent events on 127.0.0.1:8406; React,
   TypeScript and Vite; TanStack Query for server state; Motion for React and three.js for motion;
   uv for Python and pnpm for the front end. Versions are pinned exactly. Where a newer major was
   very recent we chose the stable one (TypeScript 5.9, ESLint 9, Vite 7).
2. **Mocks behind the real interfaces.** Each of the four protocols has a mock over one shared
   in-memory world, seeded from the design mockup, and applying the real safety rules. Only
   `wiring.py` names them.
3. **Types generated from the server.** The Pydantic models are the contract. `make types` turns
   the OpenAPI schema into TypeScript, and CI fails if they drift.
4. **Push, not poll.** One SSE stream with replay drives every update; queries never go stale on
   a timer.

## Consequences

- The UI, the safety rules and their tests are real now; the backends are swapped one at a time
  as their phases land, without touching routes or pages.
- The mock's virtual authenticator is not WebAuthn. Real passkeys need the HTTPS origin that
  `tailscale serve` provides, and replace one function (`api/passkey.ts`).
- pnpm replaced npm after npm crashed resolving this dependency tree; the spec's 21.4 caches
  already use pnpm.
