/**
 * @file The preview's event bus and the EventSource that reads it (spec 7.13).
 *
 * The same publish, replay and `hello` rules as the server's `events.py`, so the app's event code
 * runs unchanged: `changed` refetches, the other kinds patch the cache in place.
 */

/** One published event. */
export interface BusEvent {
  id: number;
  kind: string;
  payload: unknown;
}

const REPLAY_BUFFER_SIZE = 1000;

/** In-page publish and subscribe with replay, as `EventBus` in `events.py`. */
export class Bus {
  readonly boot = Math.random().toString(36).slice(2, 12);
  private buffer: BusEvent[] = [];
  private nextId = 1;
  private listeners = new Set<(event: BusEvent) => void>();

  /** The id of the newest event, or 0. */
  get lastId(): number {
    return this.nextId - 1;
  }

  /** Records an event and hands it to every subscriber. */
  publish(kind: string, payload: unknown): BusEvent {
    const event = { id: this.nextId++, kind, payload };
    this.buffer.push(event);
    if (this.buffer.length > REPLAY_BUFFER_SIZE) this.buffer.shift();
    this.listeners.forEach((listener) => listener(event));
    return event;
  }

  /** Tells clients to refetch the named resources. */
  changed(...resources: string[]): BusEvent {
    return this.publish("changed", { resources });
  }

  /** Buffered events newer than `lastSeen`, or one refetch-everything event if some are gone. */
  replayAfter(lastSeen: number): BusEvent[] {
    if (this.hasGap(lastSeen)) {
      return [{ id: this.lastId, kind: "changed", payload: { resources: ["*"] } }];
    }
    return this.buffer.filter((event) => event.id > lastSeen);
  }

  /** The id a client that last saw `lastSeen` continues from once its replay is sent. */
  resumePoint(lastSeen: number): number {
    return this.hasGap(lastSeen) ? this.lastId : lastSeen;
  }

  private hasGap(lastSeen: number): boolean {
    const first = this.buffer[0];
    const evicted = first !== undefined && lastSeen < first.id - 1;
    return evicted || lastSeen > this.lastId;
  }

  /** Calls `listener` for every new event until the returned function is called. */
  subscribe(listener: (event: BusEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

type Listener = (event: MessageEvent<string>) => void;

/**
 * An EventSource over the bus. It sends `hello`, then any replay after `?after=`, then live
 * events, each as a MessageEvent with `lastEventId` set, exactly as the browser would.
 */
export function busEventSource(bus: Bus, clock: () => Date) {
  return class MockEventSource {
    private listeners = new Map<string, Set<Listener>>();
    private unsubscribe: (() => void) | null = null;
    private closed = false;

    constructor(url: string) {
      const after = new URL(url, "http://preview").searchParams.get("after");
      queueMicrotask(() => this.open(after === null ? null : Number(after)));
    }

    private open(after: number | null): void {
      if (this.closed) return;
      const start = after ?? bus.lastId;
      const replay = bus.replayAfter(start);
      this.emit({
        id: bus.resumePoint(start),
        kind: "hello",
        payload: { now: clock().toISOString(), boot: bus.boot, events_version: 1 },
      });
      let newest = bus.resumePoint(start);
      for (const event of replay) {
        newest = Math.max(newest, event.id);
        this.emit(event);
      }
      this.unsubscribe = bus.subscribe((event) => {
        if (event.id > newest) this.emit(event);
      });
    }

    private emit(event: BusEvent): void {
      const message = new MessageEvent(event.kind, {
        data: JSON.stringify(event.payload),
        lastEventId: String(event.id),
      });
      this.listeners.get(event.kind)?.forEach((listener) => listener(message));
    }

    addEventListener(kind: string, listener: Listener): void {
      const set = this.listeners.get(kind) ?? new Set<Listener>();
      set.add(listener);
      this.listeners.set(kind, set);
    }

    removeEventListener(kind: string, listener: Listener): void {
      this.listeners.get(kind)?.delete(listener);
    }

    close(): void {
      this.closed = true;
      this.unsubscribe?.();
    }
  };
}
