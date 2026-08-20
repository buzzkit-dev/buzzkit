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
