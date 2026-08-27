import { spawnSync } from 'node:child_process';

export const LOCAL_URL = process.env.TINYBIRD_URL ?? 'http://localhost:7181';

export async function localToken(): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${LOCAL_URL}/tokens`);
  } catch {
    throw new Error(`Tinybird Local is not reachable at ${LOCAL_URL} — run \`bun db:up\` first`);
  }
  const body = await response.text();
  if (!response.ok || !body.startsWith('{')) {
    throw new Error(`Tinybird Local at ${LOCAL_URL} is still starting — retry in a minute`);
  }
  const tokens = JSON.parse(body) as { workspace_admin_token: string };
  return tokens.workspace_admin_token;
}

const [command = 'build', ...rest] = process.argv.slice(2);
const token = await localToken();

if (command === 'token') {
  process.stdout.write(`${token}\n`);
  process.exit(0);
}

const result = spawnSync('bunx', ['tinybird', command, '--local', ...rest], {
  stdio: 'inherit',
  env: { ...process.env, TINYBIRD_URL: LOCAL_URL, TINYBIRD_TOKEN: token },
});
process.exit(result.status ?? 1);
