import { describe, expect, it } from 'vitest';
import { resolveAgentLabel, resolveSubtitle } from '../../../src/api/ping/agents';

describe('agent labels', () => {
  it('names the tools people actually use', () => {
    expect(resolveAgentLabel('claude-code')).toBe('Claude Code');
    expect(resolveAgentLabel('codex')).toBe('Codex');
    expect(resolveAgentLabel('Cursor')).toBe('Cursor');
  });

  it('title-cases anything unknown', () => {
    expect(resolveAgentLabel('my-custom_bot')).toBe('My Custom Bot');
  });

  it('joins agent and project into the subtitle and drops what is missing', () => {
    expect(resolveSubtitle({ agent: 'claude-code', project: 'buzzkit' })).toBe('Claude Code · buzzkit');
    expect(resolveSubtitle({ agent: null, project: 'buzzkit' })).toBe('buzzkit');
    expect(resolveSubtitle({ agent: 'codex', project: null })).toBe('Codex');
    expect(resolveSubtitle({ agent: null, project: null })).toBeNull();
  });
});
