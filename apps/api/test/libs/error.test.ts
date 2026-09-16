import { describeError } from '@buzzkit/api/libs/error';
import { describe, expect, it } from 'vitest';

describe('describeError', () => {
  it('returns the message of a plain error', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  it('stringifies non-errors', () => {
    expect(describeError('boom')).toBe('boom');
    expect(describeError(42)).toBe('42');
  });

  it('appends every cause in the chain', () => {
    const origin = new Error('connection refused');
    const wrapped = new Error('Failed query: select 1', { cause: origin });
    expect(describeError(wrapped)).toBe('Failed query: select 1 <- connection refused');
  });

  it('appends a non-error cause as text', () => {
    const wrapped = new Error('Failed query', { cause: 'pool_capacity_overloaded' });
    expect(describeError(wrapped)).toBe('Failed query <- pool_capacity_overloaded');
  });

  it('stops after five messages', () => {
    let error = new Error('6');
    for (const message of ['5', '4', '3', '2', '1']) error = new Error(message, { cause: error });
    expect(describeError(error)).toBe('1 <- 2 <- 3 <- 4 <- 5');
  });
});
