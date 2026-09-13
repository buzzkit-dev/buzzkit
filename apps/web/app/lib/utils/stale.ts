const store = new Map<string, unknown>();
const listeners = new Set<() => void>();

export function rememberPage(key: string, value: unknown): void {
  store.set(key, value);
  for (const listener of listeners) listener();
}

export function recallPage<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function subscribePages(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
