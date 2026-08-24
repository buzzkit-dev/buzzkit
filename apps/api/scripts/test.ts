import { spawn } from 'node:child_process';

const port = Number(process.env.TEST_API_PORT ?? 8791);
const baseUrl = `http://localhost:${port}`;

const server = spawn(
  'bunx',
  [
    'wrangler',
    'dev',
    '--test-scheduled',
    '--local',
    '--var',
    'ENVIRONMENT:test',
    '--port',
    String(port),
    '--inspector-port',
    String(port + 1000),
    '--persist-to',
    '../../.wrangler/test-state',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] }
);

const serverLog: string[] = [];
server.stdout.on('data', (chunk) => serverLog.push(String(chunk)));
server.stderr.on('data', (chunk) => serverLog.push(String(chunk)));

const stop = () => {
  if (!server.killed) server.kill('SIGTERM');
};
process.on('SIGINT', () => {
  stop();
  process.exit(130);
});

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/v1/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  stop();
  process.stderr.write(serverLog.join(''));
  throw new Error(`API did not become ready on ${baseUrl}`);
}

await waitForServer();

const vitest = spawn('bunx', ['vitest', 'run', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, API_URL: baseUrl },
});

const code: number = await new Promise((resolve) => vitest.on('exit', (exitCode) => resolve(exitCode ?? 1)));
stop();
if (code !== 0) {
  const errors = serverLog
    .join('')
    .split('\n')
    .filter((line) => /error|✘/i.test(line));
  if (errors.length > 0) process.stderr.write(`\n[api] ${errors.slice(-20).join('\n[api] ')}\n`);
}
process.exit(code);
