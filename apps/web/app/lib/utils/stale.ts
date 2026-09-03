const store = new Map<string, unknown>();

export function rememberPage(key: string, value: unknown): void {
  store.set(key, value);
}

export function recallPage<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}
