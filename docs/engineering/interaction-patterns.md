---
id: GUIDE-0002
title: "Interaction patterns: building a list, a card or a delete"
type: runbook
status: approved
owner_role: KNW-1
approver: owner
created: 2026-11-28
last_reviewed: 2026-11-28
review_cadence_days: 180
risk_class: R1
work_item: null      # built before the work-item system exists
supersedes: []
covers: [src/control_center/web/src/components/**, src/control_center/web/src/shell/**, src/control_center/backends/mock/engine_shell.py, src/control_center/web/src/preview/shell.ts]
data_class: internal
---

# Interaction patterns

Every list, card and delete in Brain uses the components below, so one action has one meaning
everywhere (spec 7.15, principle 4) and every gesture is also a visible control (principle 5).
Decisions 138 to 143 record why. Build new lists from these rather than from a bare `.list-row`.

## A managed list row: `ActionRow`

```tsx
import { ActionRow } from "../components/ActionRow";

<div className="list">
  <ActionRow
    title={contact.name}
    meta="Known · Rental"
    status={contact.status}
    href={`/contacts/${contact.id}`}          // pressing the row opens it; a chevron shows
    start={{ label: "Allowlist", icon: Check, onSelect: allowlist }}   // swipe right
    end={{ label: "Block", icon: Ban, tone: "clay", onSelect: block }} // swipe left
    more={[allowlist action, block action, edit, { label: "Delete", destructive: true, ... }]}
  />
</div>
```

- `start` is the main action, `end` the secondary one. On a phone they are swipes; with a mouse
  they appear as labelled buttons while the pointer rests on the row; with a keyboard they
  appear when focus is inside it.
- `more` is the "…" menu. It also opens by right-click and by press and hold. **List every
  action here, including the two swipes.**
- Actions run through `useAction`, so a loosening one asks for the passkey and every result is a
  toast. Offer Undo on the toast for anything reversible.
- To open the item in place instead, pass `onOpen` rather than `href`: pressing the row runs it
  (usually opening the item's sheet) and the chevron still shows. The sheet lists every action as
  a button (decision 181). See `pages/Connections.tsx` and `pages/Voice.tsx`.
- Wrap rows in `<m.div layout="position" exit={LEAVE}>` inside `AnimatePresence` when rows can
  leave, so they glide out (decision 128). See `pages/Trash.tsx`.

## A card with acknowledge and snooze: `ActionCard`

```tsx
<ActionCard label={alert.title} start={acknowledge} end={snooze} more={[acknowledge, snooze, open]}>
  …card content…
</ActionCard>
```

Swipe right acknowledges, left snoozes (spec 7.14). See `AlertCard` in `pages/Today.tsx`.

## Just the "…" menu: `useMoreMenu`

For an avatar, a task card or anything that is not a row:

```tsx
const { triggerProps, button, menu } = useMoreMenu(actions, "Bolt");
<div {...triggerProps}>…{button}{menu}</div>
```

`useMoreMenu(actions, label, { icon, name })` gives a menu button with its own icon, as the
help menu does.

## Something that can't be undone: `HoldButton`

```tsx
<HoldButton label="Delete forever" onConfirm={purge} />
```

It reads "Hold to delete forever · can't be undone" and runs after a 1.2-second hold, with a
finger, a mouse or Space or Enter. Use it only where there is no undo; everything else happens
at once with Undo on the toast.

## Deleting something: the shared 30-day trash

Never delete a record, document, contact or rule outright (spec 7.16, rule 11). On the server
mock:

```python
from control_center.backends.mock.engine_shell import RESTORERS, send_to_trash

RESTORERS["contact"] = lambda world, contact: world.contacts.__setitem__(contact.id, contact)

removed = world.contacts.pop(contact_id)
send_to_trash(
    world,
    kind="contact",
    title=removed.name,
    meta="Known · Rental",
    home="/contacts",
    payload=removed,
)
```

and the same in the preview port (`src/preview/shell.ts`):

```ts
RESTORERS.contact = (world, contact) => { world.contacts[(contact as Contact).id] = contact as Contact; };
sendToTrash(world, { kind: "contact", title, meta, home: "/contacts" }, removed);
```

Recently deleted (`/trash`) then lists it with its days left, Restore puts it back through the
restorer and refetches its home page, and Delete for good is a hold to confirm. If a new home
page needs refetching on restore, add it to `HOME_RESOURCES` on both sides.

## Changing a setting: the impact sheet

`SettingRow` asks `GET /settings/{key}/impact?value=` before a change. When the answer has lines
(raising a cap, turning on something that costs money or load, changing a model token limit), an
impact sheet shows them with Apply; otherwise the change applies at once, so tightening stays one
tap (decision 182). A new setting with a predictable effect adds its lines in
`backends/mock/engine_accounts.py` and `src/preview/accounts.ts`. A change that was predicted
shows predicted versus actual in its History sheet once it has run for 7 days (decision 183).

## Asking Wayfinder about what is on screen

A page that shows one object names it, so the Guide panel answers about it:

```tsx
useGuideContext(doc.title);
```

To open the panel from a button or menu item: `const { open } = useGuide(); open(row.title)`.
The panel also opens from the Guide button, pull down from the top on a touch screen, and ".".

## A page that belongs to an optional feature

Give its route a `feature` (`routes.tsx`). It is in the navigation only while
`PlatformState.features_on` lists that feature; add the setting key to `APP_FEATURES` in
`backends/mock/gate.py`.

## Checklist for a new list or page

- Rows are `ActionRow`, cards that can be dismissed are `ActionCard`.
- Every swipe is also in the "…" menu.
- Deletes go to the trash; only purges, and deletes the spec says must destroy their data (such
  as a voice sample), use `HoldButton`.
- Nothing appears or vanishes: entering and leaving rows fade and glide (decision 128).
- Mock endpoint, preview port, a parity step in `scripts/record_mock_parity.py`, tests, and
  `make ci` before you push.
