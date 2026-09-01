import type { Step } from '@buzzkit/schema/workflows';
import type { RunContext } from '../context';
import { runBranch } from './branch';
import { runExit } from './exit';
import { runFetch } from './fetch';
import { runForEach } from './for-each';
import { runRepeat } from './repeat';
import { runLocalWindow, runSend } from './send';
import { runSet } from './set';
import { runWait } from './wait';
import { runWaitFor } from './wait-for';
import { runWaitUntil } from './wait-until';

export async function runSteps(context: RunContext, steps: Step[]): Promise<void> {
  for (let index = 0; index < steps.length; index += 1) {
    const current = steps[index]!;
    context.current = 'exit' in current ? 'exit' : current.name;

    const next = steps[index + 1];

    if ('waitUntil' in current && next !== undefined && 'send' in next && next.send.deliver === 'local') {
      await runLocalWindow(context, current, next);
      index += 1;
      continue;
    }
    if ('exit' in current) await runExit(context);
    else if ('wait' in current) await runWait(context, current);
    else if ('waitUntil' in current) await runWaitUntil(context, current);
    else if ('waitFor' in current) await runWaitFor(context, current);
    else if ('repeat' in current) await runRepeat(context, current, runSteps);
    else if ('forEach' in current) await runForEach(context, current, runSteps);
    else if ('branch' in current) await runBranch(context, current, runSteps);
    else if ('fetch' in current) await runFetch(context, current);
    else if ('set' in current) await runSet(context, current);
    else await runSend(context, current);
  }
}
