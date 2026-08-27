import { encodeEventCursor, resolveEventCursor } from '@buzzkit/api/api/events/queries';
import { BadRequestError } from '@buzzkit/api/libs/error';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@buzzkit/api/libs/actor', () => ({ subscriberActor: vi.fn() }));

const id = 'evt_0198eb66-327b-7abc-8def-0123456789ab';

function expectInvalidCursor(cursor: string) {
  let thrown: unknown;
  try {
    resolveEventCursor(cursor);
  } catch (error) {
    thrown = error;
  }
  expect(thrown, cursor).toBeInstanceOf(BadRequestError);
  const error = thrown as InstanceType<typeof BadRequestError>;
  expect(error.code).toBe('invalid_cursor');
  expect(error.param).toBe('cursor');
}

describe('encodeEventCursor', () => {
  it('joins the ISO received time and the id with an underscore', () => {
    expect(encodeEventCursor({ received_at: '2026-08-27 10:00:00.000', id })).toBe(
      `2026-08-27T10:00:00.000Z_${id}`
    );
    expect(encodeEventCursor({ received_at: '2026-08-27 10:00:00', id })).toBe(
      `2026-08-27T10:00:00.000Z_${id}`
    );
  });

  it('round-trips through resolveEventCursor', () => {
    expect(resolveEventCursor(encodeEventCursor({ received_at: '2026-08-27 10:00:00.123', id }))).toEqual({
      receivedAt: '2026-08-27T10:00:00.123Z',
      id,
    });
  });
});

describe('resolveEventCursor', () => {
  it('passes undefined through', () => {
    expect(resolveEventCursor(undefined)).toBeUndefined();
  });

  it('splits a full cursor into the received time and the id', () => {
    expect(resolveEventCursor(`2026-08-27T10:00:00.000Z_${id}`)).toEqual({
      receivedAt: '2026-08-27T10:00:00.000Z',
      id,
    });
  });

  it('accepts an ISO-only cursor and normalises it', () => {
    expect(resolveEventCursor('2026-08-27T10:00:00.000Z')).toEqual({
      receivedAt: '2026-08-27T10:00:00.000Z',
    });
    expect(resolveEventCursor('2026-08-27T12:00:00+02:00')).toEqual({
      receivedAt: '2026-08-27T10:00:00.000Z',
    });
    expect(resolveEventCursor('2026-08-27T10:00:00.000Z')?.id).toBeUndefined();
  });

  it('rejects an unparsable date', () => {
    expectInvalidCursor('yesterday');
    expectInvalidCursor(`yesterday_${id}`);
    expectInvalidCursor('');
  });

  it('rejects a malformed id', () => {
    expectInvalidCursor('2026-08-27T10:00:00.000Z_evt_x');
    expectInvalidCursor('2026-08-27T10:00:00.000Z_');
    expectInvalidCursor(`2026-08-27T10:00:00.000Z_${id.slice(4)}`);
    expectInvalidCursor(`2026-08-27T10:00:00.000Z_msg_${id.slice(4)}`);
    expectInvalidCursor(`2026-08-27T10:00:00.000Z_${id.toUpperCase()}`);
  });
});
