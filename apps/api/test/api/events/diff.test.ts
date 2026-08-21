import { diffForEvent } from '@buzzkit/api/api/events/index';
import { describe, expect, it } from 'vitest';

describe('diffForEvent', () => {
  it('lists changed keys with their previous values, compares dates by instant and objects structurally, ignores updatedAt', () => {
    const at = new Date('2026-01-01T00:00:00Z');
    const before = { name: 'a', settings: { x: 1 }, when: at, updatedAt: new Date(0), untouched: 'same' };
    const after = {
      name: 'b',
      settings: { x: 1 },
      when: new Date(at.getTime()),
      updatedAt: new Date(),
      untouched: 'same',
    };
    expect(diffForEvent(before, after)).toEqual({ changes: ['name'], previousAttributes: { name: 'a' } });
    expect(diffForEvent(before, { ...after, settings: { x: 2 } }).changes).toEqual(['name', 'settings']);
  });
});
