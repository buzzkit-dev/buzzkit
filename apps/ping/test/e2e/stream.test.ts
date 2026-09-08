import { describe, expect, it } from 'vitest';
import { PING_URL, pair, ping } from '../utils/api';

function listen(key: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${PING_URL.replace(/^http/, 'ws')}/${key}/stream`);
    socket.addEventListener('message', (event) => {
      socket.close();
      resolve(String(event.data));
    });
    socket.addEventListener('error', () => reject(new Error('socket failed')));
    socket.addEventListener('open', () => {
      void ping(key, { title: 'Tests passed' });
    });
  });
}

describe('timeline stream', () => {
  it('tells a listening phone the moment an event lands', async () => {
    const { key } = await pair();
    expect(await listen(key)).toBe('timeline');
  });

  it('refuses an unknown key', async () => {
    const outcome = await new Promise<string>((resolve) => {
      const socket = new WebSocket(`${PING_URL.replace(/^http/, 'ws')}/bz_00000000000000000000000/stream`);
      socket.addEventListener('open', () => resolve('open'));
      socket.addEventListener('error', () => resolve('refused'));
      socket.addEventListener('close', () => resolve('refused'));
    });
    expect(outcome).toBe('refused');
  });
});
