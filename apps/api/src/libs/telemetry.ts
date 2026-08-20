/**
 * Span-level tracing interface. Currently a no-op passthrough — call sites wrap
 * database calls and business logic in `trace('name', async (t) => …)` from day
 * one, and the Phase 10 observability pass swaps these internals for real
 * OpenTelemetry spans without touching any call site.
 */

export type Span = {
  set(key: string, value: unknown): void;
  trace<T>(name: string, fn: (t: Span) => Promise<T>): Promise<T>;
};

const span: Span = {
  set() {},
  trace(_name, fn) {
    return fn(span);
  },
};

export async function trace<T>(name: string, fn: (t: Span) => Promise<T>): Promise<T>;
export async function trace<T>(name: string, fn: () => Promise<T>): Promise<T>;
export async function trace<T>(_name: string, fn: (t: Span) => Promise<T>): Promise<T> {
  return fn(span);
}

export function setAuthSpanAttributes(_auth: unknown): void {}
