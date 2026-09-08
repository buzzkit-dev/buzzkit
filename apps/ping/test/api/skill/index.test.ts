import { describe, expect, it } from 'vitest';
import { renderSkill } from '../../../src/api/skill/index';

describe('skill server URLs', () => {
  it('keeps claims and tool endpoints on the server that issued the code', () => {
    const origin = 'http://100.102.32.85:8792';
    const skill = renderSkill(null, origin);
    expect(skill).toContain(`${origin}/pair/claim`);
    expect(skill).toContain(`${origin}/YOUR_KEY`);
    expect(skill).not.toContain('https://ping.buzzkit.dev');
  });

  it('preserves production defaults and substitutes the paired key', () => {
    expect(renderSkill('bz_test')).toContain('https://ping.buzzkit.dev/bz_test');
    expect(renderSkill('bz_test')).not.toContain('YOUR_KEY');
  });
});
