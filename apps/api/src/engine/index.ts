import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { log } from '@buzzkit/api/libs/logger';
import { ExitRun, RunContext } from './context';
import { describeFailure } from './errors';
import { runSteps } from './steps';
import type { RunParams } from './types';

export class EngineWorkflow extends WorkflowEntrypoint<Env, RunParams> {
  async run(event: WorkflowEvent<RunParams>, step: WorkflowStep): Promise<void> {
    const context = new RunContext(this.env, this.ctx, event.payload, step);
    try {
      await runSteps(context, context.params.spec.steps);
      await this.finish(context, { status: 'completed' });
    } catch (error) {
      if (error instanceof ExitRun) {
        await this.finish(context, { status: 'completed' });
        return;
      }
      await this.finish(context, {
        status: 'failed',
        error: describeFailure(error),
        step: context.current,
      });
      throw error;
    }
  }

  private finish(
    context: RunContext,
    finish: { status: 'completed' | 'failed'; error?: string; step?: string | null }
  ) {
    const { runId, workflowSlug } = context.params;
    return context.do(finish.status === 'completed' ? 'finish' : 'fail', async () => {
      if (finish.status === 'failed') {
        log.error('[Engine] Run failed', { runId, workflow: workflowSlug, error: finish.error });
      } else {
        log.info('[Engine] Run completed', { runId, workflow: workflowSlug });
      }
      await (await context.actor()).finishRun(runId, finish);
      return {};
    });
  }
}
