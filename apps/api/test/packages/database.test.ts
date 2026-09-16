import { isConnectionError, retryOnConnectionError, type Sql, withConnectionRetry } from '@buzzkit/database';
import { describe, expect, it, vi } from 'vitest';

const connectionClosed = () =>
  Object.assign(new Error('write CONNECTION_CLOSED'), { code: 'CONNECTION_CLOSED' });
const poolFailure = () =>
  new Error('Failed query: select 1', {
    cause: Object.assign(new Error('Failed to acquire a connection from the pool.'), { code: '58000' }),
  });
const uniqueViolation = () => Object.assign(new Error('duplicate key'), { code: '23505' });

function fakeClient(failures: (() => Error)[]) {
  const attempt = async () => {
    const failure = failures.shift();
    if (failure) throw failure();
  };
  const unsafe = vi.fn(() => {
    return {
      then: (resolve: (rows: unknown) => unknown, reject: (error: unknown) => unknown) =>
        attempt()
          .then(() => [{ ok: true }])
          .then(resolve, reject),
      values: () => attempt().then(() => [[1]]),
    };
  });
  const begin = vi.fn(async (...args: unknown[]) => {
    await attempt();
    const callback = args.at(-1) as (transaction: unknown) => Promise<unknown>;
    return callback({ inTransaction: true });
  });
  const options = { parsers: {}, serializers: {} };

  return { client: { unsafe, begin, options } as unknown as Sql, unsafe, begin };
}

describe('isConnectionError', () => {
  it('recognizes postgres.js connection codes and Hyperdrive SQLSTATEs', () => {
    expect(isConnectionError(connectionClosed())).toBe(true);
    expect(isConnectionError(poolFailure())).toBe(true);
    expect(isConnectionError(Object.assign(new Error('gone'), { code: '08006' }))).toBe(true);
    expect(isConnectionError(Object.assign(new Error('too many clients'), { code: '53300' }))).toBe(true);
  });

  it('leaves real Postgres errors alone', () => {
    expect(isConnectionError(uniqueViolation())).toBe(false);
    expect(isConnectionError(new Error('plain'))).toBe(false);
    expect(isConnectionError('string')).toBe(false);
    expect(isConnectionError(null)).toBe(false);
  });
});

describe('retryOnConnectionError', () => {
  it('retries once per configured delay and reports each attempt', async () => {
    const onRetry = vi.fn();
    const run = vi
      .fn()
      .mockRejectedValueOnce(connectionClosed())
      .mockRejectedValueOnce(poolFailure())
      .mockResolvedValue('ok');
    await expect(retryOnConnectionError(run, { delaysMs: [0, 0], onRetry })).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenLastCalledWith(expect.any(Error), 2);
  });

  it('gives up after the last delay', async () => {
    const run = vi.fn().mockRejectedValue(connectionClosed());
    await expect(retryOnConnectionError(run, { delaysMs: [0] })).rejects.toThrow('CONNECTION_CLOSED');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does not retry query errors', async () => {
    const run = vi.fn().mockRejectedValue(uniqueViolation());
    await expect(retryOnConnectionError(run, { delaysMs: [0, 0] })).rejects.toThrow('duplicate key');
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('withConnectionRetry', () => {
  it('retries an awaited query', async () => {
    const { client, unsafe } = fakeClient([connectionClosed]);
    const retrying = withConnectionRetry(client, { delaysMs: [0] });
    await expect(retrying.unsafe('select 1', [])).resolves.toEqual([{ ok: true }]);
    expect(unsafe).toHaveBeenCalledTimes(2);
  });

  it('retries a query read through values()', async () => {
    const { client, unsafe } = fakeClient([poolFailure]);
    const retrying = withConnectionRetry(client, { delaysMs: [0] });
    await expect(retrying.unsafe('select 1', []).values()).resolves.toEqual([[1]]);
    expect(unsafe).toHaveBeenCalledTimes(2);
  });

  it('surfaces a query error without retrying', async () => {
    const { client, unsafe } = fakeClient([uniqueViolation]);
    const retrying = withConnectionRetry(client, { delaysMs: [0] });
    await expect(retrying.unsafe('insert', [])).rejects.toThrow('duplicate key');
    expect(unsafe).toHaveBeenCalledTimes(1);
  });

  it('retries a transaction that failed before its callback ran', async () => {
    const { client, begin } = fakeClient([poolFailure]);
    const callback = vi.fn(async () => 'committed');
    const retrying = withConnectionRetry(client, { delaysMs: [0] });
    await expect(retrying.begin(callback as never)).resolves.toBe('committed');
    expect(begin).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('never re-runs a transaction whose callback already started', async () => {
    const { client, begin } = fakeClient([]);
    const callback = vi.fn(async () => {
      throw connectionClosed();
    });
    const retrying = withConnectionRetry(client, { delaysMs: [0, 0] });
    await expect(retrying.begin(callback as never)).rejects.toThrow('CONNECTION_CLOSED');
    expect(begin).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('passes every other client property through', () => {
    const { client } = fakeClient([]);
    const retrying = withConnectionRetry(client, {});
    expect(retrying.options).toBe(client.options);
  });
});
