import { describe, expect, it } from 'vitest';
import {
  AuthenticationError,
  BadRequestError,
  BuzzKitError,
  ConfigurationError,
  ConflictError,
  ConnectionError,
  isBuzzKitError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  resolveError,
  ServerError,
  TimeoutError,
} from '../../src/core/errors';

const body = { code: 'not_found', message: 'Message not found', param: 'id' };

describe('resolveError', () => {
  it('maps a status onto its error class', () => {
    const cases = [
      [400, BadRequestError],
      [422, BadRequestError],
      [401, AuthenticationError],
      [403, PermissionError],
      [404, NotFoundError],
      [409, ConflictError],
      [410, ConflictError],
      [429, RateLimitError],
      [500, ServerError],
      [503, ServerError],
    ] as const;

    for (const [status, expected] of cases) {
      expect(resolveError(status, body, {}), String(status)).toBeInstanceOf(expected);
    }
  });

  it('falls back to the base error for an unmapped status', () => {
    const error = resolveError(418, body, {});

    expect(error.constructor).toBe(BuzzKitError);
    expect(error.name).toBe('BuzzKitError');
  });

  it('carries the API error detail through', () => {
    const error = resolveError(404, body, { requestId: 'req_1' });

    expect(error.message).toBe('Message not found');
    expect(error.code).toBe('not_found');
    expect(error.param).toBe('id');
    expect(error.status).toBe(404);
    expect(error.requestId).toBe('req_1');
  });

  it('carries validation details', () => {
    const details = [{ param: 'to', message: 'Required' }];
    const error = resolveError(400, { code: 'validation', message: 'Invalid', details }, {});

    expect(error.details).toEqual(details);
  });

  it('exposes the retry delay on a rate limit', () => {
    const error = resolveError(
      429,
      { code: 'rate_limited', message: 'Slow down' },
      {
        retryAfterSeconds: 7,
      }
    );

    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfterSeconds).toBe(7);
  });
});

describe('error classes', () => {
  it('names every class after itself so stacks read correctly', () => {
    const named: Array<[BuzzKitError, string]> = [
      [new BadRequestError('x', { status: 400, code: 'bad_request' }), 'BadRequestError'],
      [new AuthenticationError('x', { status: 401, code: 'unauthorized' }), 'AuthenticationError'],
      [new PermissionError('x', { status: 403, code: 'forbidden' }), 'PermissionError'],
      [new NotFoundError('x', { status: 404, code: 'not_found' }), 'NotFoundError'],
      [new ConflictError('x', { status: 409, code: 'conflict' }), 'ConflictError'],
      [new RateLimitError('x', { status: 429, code: 'rate_limited' }), 'RateLimitError'],
      [new ServerError('x', { status: 500, code: 'internal' }), 'ServerError'],
      [new ConnectionError('x'), 'ConnectionError'],
      [new TimeoutError('x'), 'TimeoutError'],
      [new ConfigurationError('x'), 'ConfigurationError'],
    ];

    for (const [error, name] of named) {
      expect(error.name, name).toBe(name);
      expect(error, name).toBeInstanceOf(BuzzKitError);
      expect(error, name).toBeInstanceOf(Error);
    }
  });

  it('gives transport failures no status and a stable code', () => {
    const connection = new ConnectionError('offline');
    const timeout = new TimeoutError('too slow');

    expect(connection.status).toBeNull();
    expect(connection.code).toBe('connection');
    expect(timeout.status).toBeNull();
    expect(timeout.code).toBe('timeout');
    expect(timeout).toBeInstanceOf(ConnectionError);
  });

  it('keeps the cause of a connection failure', () => {
    const cause = new Error('ECONNREFUSED');
    expect(new ConnectionError('offline', { cause }).cause).toBe(cause);
  });
});

describe('isBuzzKitError', () => {
  it('recognizes every BuzzKit error', () => {
    expect(isBuzzKitError(new NotFoundError('x', { status: 404, code: 'not_found' }))).toBe(true);
    expect(isBuzzKitError(new ConfigurationError('x'))).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isBuzzKitError(new Error('plain'))).toBe(false);
    expect(isBuzzKitError('not_found')).toBe(false);
    expect(isBuzzKitError(null)).toBe(false);
  });
});
