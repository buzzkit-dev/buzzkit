import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderAgentIndex } from '../src/lib/agent-index';

const dist = resolve(import.meta.dirname, '../dist');
const skill = readFileSync(resolve(dist, '.well-known/agent-skills/buzzkit/SKILL.md'));

writeFileSync(resolve(dist, '.well-known/agent-skills/index.json'), renderAgentIndex(skill));
