import { createHash } from 'node:crypto';
import { site } from './site';

export function renderAgentIndex(skill: Uint8Array | string): string {
  const digest = createHash('sha256').update(skill).digest('hex');
  const index = {
    $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    skills: [
      {
        name: 'buzzkit',
        description:
          'Integrate BuzzKit push notifications into an app. Register devices with the iOS SDK, identify subscribers, send messages from a backend, and set up topics, segments, scheduled sends and workflows through the REST API.',
        type: 'skill-md',
        url: `${site.url}/.well-known/agent-skills/buzzkit/SKILL.md`,
        digest: `sha256:${digest}`,
      },
    ],
  };
  return `${JSON.stringify(index, null, 2)}\n`;
}
