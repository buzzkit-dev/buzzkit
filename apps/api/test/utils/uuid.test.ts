import { uuidv7 } from '@buzzkit/api/utils/uuid';
import { describe, expect, it } from 'vitest';

const shape = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const embeddedMs = (id: string) => Number.parseInt(id.replace(/-/g, '').slice(0, 12), 16);

const counter = (id: string) => Number.parseInt(id.replace(/-/g, '').slice(13, 16), 16);

describe('uuidv7', () => {
  it('produces RFC 9562 version 7 ids with the variant bits set', () => {
    for (let index = 0; index < 50; index++) {
      const id = uuidv7(1_000_000_000_000 + index);
      expect(id).toMatch(shape);
      expect(id).toHaveLength(36);
    }
    expect(uuidv7()).toMatch(shape);
  });

  it('embeds the millisecond timestamp in the first 48 bits', () => {
    for (const ms of [0, 1, 1_756_296_000_123, 2 ** 48 - 1]) {
      expect(embeddedMs(uuidv7(ms))).toBe(ms);
    }
    expect(uuidv7(1_756_296_000_123).slice(0, 13)).toBe('0198eb66-327b');
    expect(embeddedMs(uuidv7())).toBeGreaterThanOrEqual(Date.now() - 1000);
  });

  it('is strictly increasing when called repeatedly within the same millisecond', () => {
    const ms = 1_700_000_000_000;
    const ids = Array.from({ length: 500 }, () => uuidv7(ms));
    for (let index = 1; index < ids.length; index++) {
      expect(ids[index]! > ids[index - 1]!, `${ids[index - 1]} < ${ids[index]}`).toBe(true);
      expect(counter(ids[index]!)).toBe(counter(ids[index - 1]!) + 1);
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => embeddedMs(id) === ms)).toBe(true);
  });

  it('seeds the counter below half its range so a burst never wraps early', () => {
    for (let index = 0; index < 100; index++) {
      expect(counter(uuidv7(1_800_000_000_000 + index))).toBeLessThan(0x800);
    }
  });

  it('orders ids by timestamp across increasing milliseconds', () => {
    const ids = Array.from({ length: 100 }, (_, index) => uuidv7(1_600_000_000_000 + index * 7));
    expect([...ids].sort()).toEqual(ids);
    expect(ids.map(embeddedMs)).toEqual(
      Array.from({ length: 100 }, (_, index) => 1_600_000_000_000 + index * 7)
    );
  });

  it('honours an older millisecond after a newer one, sorting it before the newer id', () => {
    const newer = uuidv7(1_500_000_000_500);
    const older = uuidv7(1_500_000_000_100);
    expect(embeddedMs(older)).toBe(1_500_000_000_100);
    expect(older < newer).toBe(true);
    const again = uuidv7(1_500_000_000_100);
    expect(again > older).toBe(true);
    expect(counter(again)).toBe(counter(older) + 1);
  });

  it('keeps the random tail different between ids of the same millisecond', () => {
    const [a, b] = [uuidv7(1_400_000_000_000), uuidv7(1_400_000_000_000)];
    expect(a!.slice(24)).not.toBe(b!.slice(24));
  });
});
