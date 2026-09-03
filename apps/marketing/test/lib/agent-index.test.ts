import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { renderAgentIndex } from '../../src/lib/agent-index';
import { site } from '../../src/lib/site';

const SKILL = '---\nname: buzzkit\n---\n\n# BuzzKit\n';

describe('renderAgentIndex', () => {
  const rendered = renderAgentIndex(SKILL);
  const index = JSON.parse(rendered) as {
    $schema: string;
    skills: { name: string; description: string; type: string; url: string; digest: string }[];
  };

  it('declares the agent-skills discovery schema and one skill', () => {
    expect(index.$schema).toBe('https://schemas.agentskills.io/discovery/0.2.0/schema.json');
    expect(index.skills).toHaveLength(1);
    expect(index.skills[0]).toMatchObject({
      name: 'buzzkit',
      type: 'skill-md',
      url: `${site.url}/.well-known/agent-skills/buzzkit/SKILL.md`,
    });
    expect(index.skills[0]?.description.length).toBeGreaterThan(40);
  });

  it('digests the skill file as sha256 hex', () => {
    const digest = createHash('sha256').update(SKILL).digest('hex');
    expect(index.skills[0]?.digest).toBe(`sha256:${digest}`);
    expect(index.skills[0]?.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('changes the digest when the skill changes and accepts bytes', () => {
    expect(renderAgentIndex(`${SKILL}\n`)).not.toBe(rendered);
    expect(renderAgentIndex(new TextEncoder().encode(SKILL))).toBe(rendered);
  });

  it('writes two-space JSON with a trailing newline', () => {
    expect(rendered).toBe(`${JSON.stringify(index, null, 2)}\n`);
  });
});
