import { createHash } from 'node:crypto';
import { site } from './site';

const SKILL_BASE = `${site.url}/.well-known/agent-skills/buzzkit`;

export type AgentReference = { path: string; content: Uint8Array | string };

function digestOf(content: Uint8Array | string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

export function renderAgentIndex(skill: Uint8Array | string, references: AgentReference[] = []): string {
  const files = references
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((reference) => ({ url: `${SKILL_BASE}/${reference.path}`, digest: digestOf(reference.content) }));
  const index = {
    $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    skills: [
      {
        name: 'buzzkit',
        description:
          'Integrate BuzzKit, the open source notification orchestration layer, into an app and its backend: the TypeScript SDK, the REST API, the iOS SDK, subscribers, topics and preferences, segments, scheduled sends, events, workflows, Live Activities, sources and webhooks.',
        type: 'skill-md',
        url: `${SKILL_BASE}/SKILL.md`,
        digest: digestOf(skill),
        ...(files.length > 0 ? { files } : {}),
      },
    ],
  };
  return `${JSON.stringify(index, null, 2)}\n`;
}
