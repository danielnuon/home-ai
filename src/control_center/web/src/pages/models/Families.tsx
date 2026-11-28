/**
 * @file Model families on the Models page: each family's model, with Pin and Unpin. Pinning shows
 * what it does before it is applied (spec 7.18); unpinning is one tap with Undo.
 */
import { Pin, PinOff } from "lucide-react";
import { useState } from "react";
import { useAction } from "../../api/actions";
import { send } from "../../api/client";
import type { ModelsOverview } from "../../api/types";
import { ActionRow } from "../../components/ActionRow";
import { ImpactCard } from "../../components/ImpactCard";
import { Section } from "../../components/Page";
import { Sheet } from "../../components/Sheet";

type Family = ModelsOverview["assignments"][number];

/** Sends a pin or an unpin for one family. */
const sendPin = (family: string, pinned: boolean) =>
  send<ModelsOverview>("PUT", `/models/families/${family}/pin`, { pinned });

/** One family's row: Pin opens the confirm sheet; Unpin is one tap with Undo. */
function FamilyRow({ family, onPin }: { family: Family; onPin: (family: Family) => void }) {
  const repin = useAction<ModelsOverview>({ refresh: ["models"] });
  const unpin = useAction<ModelsOverview>({
    refresh: ["models"],
    done: () => ({
      message: `${family.family} unpinned`,
      undo: () => void repin.run(() => sendPin(family.family, true)),
    }),
  });
  const action = family.pinned
    ? {
        label: "Unpin",
        icon: PinOff,
        onSelect: () => void unpin.run(() => sendPin(family.family, false)),
      }
    : { label: "Pin", icon: Pin, onSelect: () => onPin(family) };
  return (
    <ActionRow
      title={`${family.family} · ${family.model}`}
      meta={`${family.meta}${family.pinned ? " · pinned" : ""}`}
      status={family.residency}
      start={action}
      more={[action]}
    />
  );
}

/** The confirm sheet for a pin, with its impact card. */
function PinSheet({
  family,
  impact,
  onClose,
  onPin,
}: {
  family: Family | null;
  impact: ModelsOverview["pin_impact"];
  onClose: () => void;
  onPin: (family: string) => void;
}) {
  return (
    <Sheet open={family !== null} title={`Pin ${family?.family ?? ""}`} onClose={onClose}>
      <div className="stack">
        <p>
          {family?.model} stays assigned to {family?.family} through re-selection until you unpin
          it.
        </p>
        <ImpactCard lines={impact} />
        <button
          type="button"
          className="btn primary"
          onClick={() => family && onPin(family.family)}
        >
          <Pin size={18} aria-hidden="true" />
          Pin {family?.family}
        </button>
      </div>
    </Sheet>
  );
}

/** Every family with its model, residency and pin. */
export function Families({ models }: { models: ModelsOverview }) {
  const [pinning, setPinning] = useState<Family | null>(null);
  const pin = useAction<ModelsOverview>({
    refresh: ["models"],
    done: () => `${pinning?.family ?? "Family"} pinned`,
  });
  return (
    <Section title="Model families">
      <div className="list">
        {models.assignments.map((assignment) => (
          <FamilyRow key={assignment.family} family={assignment} onPin={setPinning} />
        ))}
      </div>
      <PinSheet
        family={pinning}
        impact={models.pin_impact}
        onClose={() => setPinning(null)}
        onPin={(family) => {
          void pin.run(() => sendPin(family, true)).then((done) => done && setPinning(null));
        }}
      />
    </Section>
  );
}
