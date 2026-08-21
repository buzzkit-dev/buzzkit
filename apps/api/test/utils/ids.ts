import { readFileSync } from 'node:fs';
import path from 'node:path';
import Sqids from 'sqids';

const wrangler = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../../wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, '')
) as { vars: { SQIDS_ALPHABET: string } };

const sqids = new Sqids({ minLength: 18, alphabet: wrangler.vars.SQIDS_ALPHABET });

export const encodeMessageId = (id: number) => `msg_${sqids.encode([id])}`;

export const encodeDeliveryId = (id: number) => `dlv_${sqids.encode([id])}`;
