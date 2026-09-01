import { assertChannelsConnected } from '@buzzkit/api/api/credentials/index';
import { describe, expect, it } from 'vitest';

describe('assertChannelsConnected', () => {
  it('accepts any subset of the connected channels, including none', () => {
    expect(() => assertChannelsConnected(['push', 'email'], ['push'], 'channels')).not.toThrow();
    expect(() => assertChannelsConnected(['push', 'email'], ['email', 'push'], 'channels')).not.toThrow();
    expect(() => assertChannelsConnected(['push'], [], 'channels')).not.toThrow();
    expect(() => assertChannelsConnected([], [], 'channels')).toThrow(/No channel is connected/);
  });

  it('refuses the first channel that is not connected with the channel_not_connected code', () => {
    try {
      assertChannelsConnected(['email'], ['email', 'push'], 'channels');
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toMatchObject({ code: 'channel_not_connected', param: 'channels' });
      expect(String((error as Error).message)).toContain("'push'");
    }
  });

  it('refuses everything when nothing is connected', () => {
    expect(() => assertChannelsConnected([], ['push'], 'channel')).toThrow(/No channel is connected/);
  });
});
