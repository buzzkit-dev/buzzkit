export async function eventually<T>(
  probe: () => T | undefined | null | false | Promise<T | undefined | null | false>,
  options: { timeoutMs?: number; intervalMs?: number; label?: string } = {}
): Promise<T> {
  const deadline = Date.now() + (options.timeoutMs ?? 90_000);
  let last: unknown;
  while (Date.now() < deadline) {
    last = await probe();
    if (last) return last as T;
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs ?? 500));
  }
  throw new Error(
    `${options.label ?? 'condition'} did not become true in time (last: ${JSON.stringify(last)})`
  );
}
