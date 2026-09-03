import { spawnSync } from 'node:child_process';

const command = process.argv[2];
const url = process.env.DATABASE_URL_PRODUCTION;

if (!command || !['migrate', 'push', 'studio'].includes(command)) {
  process.stderr.write('Usage: bun scripts/production.ts <migrate|push|studio>\n');
  process.exit(1);
}
if (!url) {
  process.stderr.write(
    'DATABASE_URL_PRODUCTION is not set. Put the direct connection string in packages/database/.env.\n'
  );
  process.exit(1);
}

const target = new URL(url);
target.searchParams.delete('sslrootcert');
if (!target.searchParams.has('sslmode')) target.searchParams.set('sslmode', 'require');

const result = spawnSync('bunx', ['drizzle-kit', command], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: target.toString() },
});
process.exit(result.status ?? 1);
