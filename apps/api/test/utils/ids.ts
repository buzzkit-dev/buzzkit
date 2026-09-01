import { readFileSync } from 'node:fs';
import path from 'node:path';
import Sqids from 'sqids';

const alphabet = readFileSync(path.resolve(import.meta.dirname, '../../.dev.vars'), 'utf8').match(
  /^SQIDS_ALPHABET=(.+)$/m
)?.[1];
if (!alphabet) throw new Error('SQIDS_ALPHABET missing from apps/api/.dev.vars');

const sqids = new Sqids({ minLength: 18, alphabet });

export const encodeMessageId = (id: number) => `msg_${sqids.encode([id])}`;
