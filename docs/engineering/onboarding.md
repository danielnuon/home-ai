---
id: GUIDE-0001
title: "Onboarding: your first hour"
type: runbook
status: approved
owner_role: KNW-1
approver: owner
created: 2026-10-28
last_reviewed: 2026-10-29
review_cadence_days: 180
risk_class: R1
work_item: null      # built before the work-item system exists
supersedes: []
covers: [src/control_center/**, Makefile]
data_class: internal
---

# Onboarding: your first hour

## 1. Run it (10 minutes)

```sh
make install
make dev
```

Open http://localhost:5173. You are signed in as the Owner through the development identity
(`BRAIN_DEV_IDENTITY=1`, allowed only on 127.0.0.1). The team is simulated: token rates drift and
Bolt's transcript on Live keeps growing.

Try the safety rules: on Spend, turn on a paid feature. The passkey sheet appears, because turning
a feature on loosens a limit. Turn it off again: no passkey. Try a cap above its ceiling: refused.

## 2. Follow one request end to end (20 minutes)

Pick "Approve" on an approval card and trace it:

1. `web/src/components/ApprovalCard.tsx` calls `useAction(...).run(...)`.
2. `web/src/api/actions.ts` sends it through `client.ts` and handles a step-up if the gate asks.
3. `routes/gate.py` → `decide` passes it to the gate.
4. `backends/mock/gate.py` → `MockApprovalGate.decide` applies the rule and publishes `changed`.
5. `events.py` streams the event; `web/src/api/events.ts` refetches `approvals`, `today` and
   `platform`, so every open tab updates.

## 3. Make a change (30 minutes)

Adding a field to a page:

1. Add it to the model in `contract/` and fill it in the mock fixture.
2. `make types` regenerates `web/src/api/schema.d.ts`.
3. Use it in the page. TypeScript now knows the field.
4. `make ci` before you push. CI fails if the generated types are stale.

## House rules (spec 17.18)

- Every file starts with a comment saying what it is for; every exported function has a
  docstring or JSDoc. Comments explain *why*, not what.
- Functions stay small (complexity 10, 60 lines in TSX, 50 statements in Python); linters enforce it.
- No rule about who may do what goes in a route or a component. It belongs in the gate.
- Words on screen are short, kind and in sentence case. Status is always a symbol and a word,
  never color alone.
- Only `transform` and `opacity` animate.
