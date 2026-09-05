import { describe, expect, it } from 'vitest';
import { runConcurrently } from '../../src/utils/concurrency';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function gauge() {
  let running = 0;
  let peak = 0;
  return {
    enter() {
      running += 1;
      peak = Math.max(peak, running);
    },
    leave() {
      running -= 1;
    },
    get running() {
      return running;
    },
    get peak() {
      return peak;
    },
  };
}

describe('runConcurrently', () => {
  it('visits every item exactly once, with its index, and never exceeds the limit', async () => {
    const seen: Array<[number, number]> = [];
    const load = gauge();

    await runConcurrently([10, 20, 30, 40, 50, 60, 70], 3, async (item, index) => {
      load.enter();
      await wait(item % 20 === 0 ? 4 : 1);
      seen.push([item, index]);
      load.leave();
    });

    expect([...seen].sort((a, b) => a[1] - b[1])).toEqual([
      [10, 0],
      [20, 1],
      [30, 2],
      [40, 3],
      [50, 4],
      [60, 5],
      [70, 6],
    ]);
    expect(load.peak).toBe(3);
    expect(load.running).toBe(0);
  });

  it('starts items in array order and hands duplicates to separate calls', async () => {
    const started: number[] = [];
    await runConcurrently(['a', 'a', 'b'], 2, async (item, index) => {
      started.push(index);
      await wait(index === 0 ? 3 : 1);
      expect(item).toBe(index === 2 ? 'b' : 'a');
    });
    expect(started).toEqual([0, 1, 2]);
  });

  it('runs at most as many workers as there are items, and none for an empty list', async () => {
    const load = gauge();
    let calls = 0;
    await runConcurrently([1, 2], 10, async () => {
      load.enter();
      calls += 1;
      await wait(1);
      load.leave();
    });
    await runConcurrently([], 10, async () => {
      calls += 1;
    });
    expect(calls).toBe(2);
    expect(load.peak).toBe(2);
  });

  it('runs one item at a time with a limit of one', async () => {
    const load = gauge();
    const order: number[] = [];
    await runConcurrently([1, 2, 3], 1, async (item) => {
      load.enter();
      await wait(1);
      order.push(item);
      load.leave();
    });
    expect(order).toEqual([1, 2, 3]);
    expect(load.peak).toBe(1);
  });

  it('refuses a limit that is not a positive integer instead of silently doing nothing', async () => {
    const noop = async () => {};
    for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(runConcurrently([1], limit, noop)).rejects.toThrow(RangeError);
    }
  });

  it('rejects with the first failure, lets in-flight items finish, and starts nothing further', async () => {
    const finished: number[] = [];
    const started: number[] = [];
    const load = gauge();

    await expect(
      runConcurrently([1, 2, 3, 4, 5, 6], 2, async (item) => {
        started.push(item);
        load.enter();
        await wait(item === 1 ? 6 : 1);
        load.leave();
        if (item === 2) throw new Error('boom');
        finished.push(item);
      })
    ).rejects.toThrow('boom');

    expect(load.running).toBe(0);
    expect(started).toEqual([1, 2]);
    expect(finished).toEqual([1]);
  });

  it('keeps the first error when several items fail', async () => {
    await expect(
      runConcurrently([1, 2, 3], 3, async (item) => {
        await wait(item);
        throw new Error(`fail ${item}`);
      })
    ).rejects.toThrow('fail 1');
  });

  it('treats a synchronous throw inside the work function like a rejection', async () => {
    await expect(
      runConcurrently([1], 1, () => {
        throw new Error('sync');
      })
    ).rejects.toThrow('sync');
  });

  it('ignores items appended while it is running', async () => {
    const items = [1, 2];
    const seen: number[] = [];
    await runConcurrently(items, 1, async (item) => {
      seen.push(item);
      if (item === 1) items.push(3);
      await wait(1);
    });
    expect(seen).toEqual([1, 2]);
  });

  it('drains a long list without recursion', async () => {
    const items = Array.from({ length: 10_000 }, (_, index) => index);
    let sum = 0;
    await runConcurrently(items, 5, async (item) => {
      sum += item;
    });
    expect(sum).toBe((9_999 * 10_000) / 2);
  });
});
