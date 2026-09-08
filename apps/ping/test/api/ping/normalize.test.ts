import { normalizePing } from '@buzzkit/ping/api/ping/index';
import { BadRequestError } from '@buzzkit/ping/libs/error';
import { describe, expect, it } from 'vitest';

describe('normalizePing', () => {
  it('treats a bare string as the title', () => {
    const input = normalizePing('  Build finished  ');

    expect(input.title).toBe('Build finished');
    expect(input.session).toBeNull();
    expect(input.status).toBeNull();
  });

  it('defaults a session to working', () => {
    const input = normalizePing({ title: 'Migrating', session: 'demo' });

    expect(input.status).toBe('working');
  });

  it('leaves a plain notification without a status', () => {
    const input = normalizePing({ title: 'Done' });

    expect(input.status).toBeNull();
  });

  it('honors an explicit terminal status', () => {
    const input = normalizePing({ title: 'Broke', session: 'demo', status: 'failed' });

    expect(input.status).toBe('failed');
  });

  it('keeps an explicit waiting status', () => {
    const input = normalizePing({ title: 'Approve the migration?', session: 'demo', status: 'waiting' });

    expect(input.status).toBe('waiting');
  });

  it('refuses a ping without a title', () => {
    expect(() => normalizePing({ body: 'orphaned' })).toThrow(BadRequestError);
  });
});
