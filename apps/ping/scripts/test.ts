import { spawn } from 'node:child_process';
import { startStub } from './stub';

const port = Number(process.env.TEST_PING_PORT ?? 8793);
const stubPort = Number(process.env.TEST_STUB_PORT ?? 8811);
const stateDir = process.env.TEST_STATE_DIR ?? '../../.wrangler/ping-test-state';
const baseUrl = `http://127.0.0.1:${port}`;
const stubUrl = `http://127.0.0.1:${stubPort}`;

const stub = startStub(stubPort);

const server = spawn(
  'bunx',
  [
    'wrangler',
    'dev',
    '--local',
    '--var',
    'ENVIRONMENT:test',
    '--var',
    `BUZZKIT_API_URL:${stubUrl}`,
    '--var',
    'BUZZKIT_API_KEY:bk_tn_testtesttesttesttest',
    '--var',
    'BUZZKIT_IDENTITY_SECRET:test-identity-secret',
    '--var',
    'BUZZKIT_PUBLISHABLE_KEY:bk_pk_testtesttesttest',
    '--port',
    String(port),
    '--inspector-port',
    String(port + 1000),
    '--persist-to',
    stateDir,
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] }
);

const serverLog: string[] = [];
server.stdout.on('data', (chunk) => serverLog.push(String(chunk)));
server.stderr.on('data', (chunk) => serverLog.push(String(chunk)));

const stop = () => {
  if (!server.killed) server.kill('SIGTERM');
  stub.stop(true);
};
process.on('SIGINT', () => {
  stop();
  process.exit(130);
});

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  stop();
  process.stderr.write(serverLog.join(''));
  throw new Error(`Ping did not become ready on ${baseUrl}`);
}

await waitForServer();

const vitest = spawn('bunx', ['vitest', 'run', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PING_URL: baseUrl,
    STUB_URL: stubUrl,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, '--no-warnings=ExperimentalWarning'].filter(Boolean).join(' '),
  },
});

const code: number = await new Promise((resolve) => vitest.on('exit', (exitCode) => resolve(exitCode ?? 1)));
stop();
if (code !== 0) {
  const errors = serverLog
    .join('')
    .split('\n')
    .filter((line) => /error|✘/i.test(line));
  if (errors.length > 0) process.stderr.write(`\n[ping] ${errors.slice(-20).join('\n[ping] ')}\n`);
}
process.exit(code);
