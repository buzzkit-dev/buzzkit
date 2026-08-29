import { ExitRun, type RunContext } from '../context';

export async function runExit(context: RunContext): Promise<never> {
  await context.do('exit', async () => {
    await context.report('exit', 'completed', 'Exited');
    return {};
  });
  throw new ExitRun();
}
