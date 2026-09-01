export async function drain<T>(
  list: (limit: number) => Promise<T[]>,
  handle: (rows: T[]) => Promise<void>,
  options: { limit: number; rounds: number }
): Promise<number> {
  let total = 0;

  for (let round = 0; round < options.rounds; round++) {
    const rows = await list(options.limit);
    if (rows.length === 0) break;

    await handle(rows);
    total += rows.length;
    if (rows.length < options.limit) break;
  }
  return total;
}
