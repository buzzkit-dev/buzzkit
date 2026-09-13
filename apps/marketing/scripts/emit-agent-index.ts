import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type AgentReference, renderAgentIndex } from '../src/lib/agent-index';

const dist = resolve(import.meta.dirname, '../dist');
const skillDir = resolve(dist, '.well-known/agent-skills/buzzkit');
const skill = readFileSync(resolve(skillDir, 'SKILL.md'));

const references: AgentReference[] = readdirSync(resolve(skillDir, 'references'))
  .filter((name) => name.endsWith('.md'))
  .map((name) => ({
    path: `references/${name}`,
    content: readFileSync(resolve(skillDir, 'references', name)),
  }));

writeFileSync(resolve(dist, '.well-known/agent-skills/index.json'), renderAgentIndex(skill, references));
