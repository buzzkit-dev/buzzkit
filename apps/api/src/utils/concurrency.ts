export async function runConcurrently<T>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => Promise<void>
): Promise<void> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`Concurrency limit must be a positive integer, got ${limit}`);
  }

  const total = items.length;
  const failures: unknown[] = [];
  let next = 0;

  const workers = Array.from({ length: Math.min(limit, total) }, async () => {
    while (next < total && failures.length === 0) {
      const index = next;
      next += 1;
      try {
        await work(items[index]!, index);
      } catch (error) {
        failures.push(error);
      }
    }
  });
  await Promise.all(workers);

  if (failures.length > 0) throw failures[0];
}
