import { cp, mkdir, rm } from 'node:fs/promises';

const source = new URL('../../web/public/flags', import.meta.url);
const target = new URL('../public/flags', import.meta.url);

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
