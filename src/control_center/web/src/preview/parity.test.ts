/**
 * @file Parity: the preview's mock backend answers a scripted session exactly as the server does.
 *
 * `parity.json` is the server's own answers, recorded by `scripts/record_mock_parity.py` on a fake
 * clock with counter ids. This replays the same requests against the TypeScript port on the same
 * clock and ids, and requires the same status, body and published events at every step. Times are
 * compared as instants, because Python and JavaScript write the same instant differently.
 */
import recorded from "./parity.json";
import { Bus, type BusEvent } from "./bus";
import { handle } from "./server";
import { buildWorld } from "./world";

interface Step {
  advance?: number;
  method: string;
  path: string;
  body: unknown;
  step_up: string | null;
  status: number;
  response: unknown;
  events: { kind: string; payload: unknown }[];
}

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** The value with every time replaced by its instant in milliseconds. */
const instants = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value ?? null), (_key, item: unknown) =>
    typeof item === "string" && ISO_TIME.test(item) ? Date.parse(item) : item,
  );

describe("the preview's mock backend", () => {
  const steps = (recorded as { steps: Step[] }).steps;
  let now = new Date((recorded as { exported_at: string }).exported_at);
  let counter = 0;
  const bus = new Bus();
  const world = buildWorld(
    bus,
    () => now,
    () => `id${++counter}`,
  );
  const published: BusEvent[] = [];
  bus.subscribe((event) => published.push(event));

  steps.forEach((step, index) => {
    if (step.advance !== undefined) {
      const seconds = step.advance;
      it(`step ${index}: ${seconds} s pass`, () => {
        now = new Date(now.getTime() + seconds * 1000);
      });
      return;
    }
    it(`step ${index}: ${step.method} ${step.path} answers as the server does`, () => {
      published.length = 0;
      const answer = handle(world, {
        method: step.method,
        path: step.path,
        body: step.body,
        stepUp: step.step_up,
      });
      expect({ status: answer.status, body: instants(answer.body) }).toEqual({
        status: step.status,
        body: instants(step.response),
      });
      expect(instants(published.map(({ kind, payload }) => ({ kind, payload })))).toEqual(
        instants(step.events),
      );
    });
  });
});
