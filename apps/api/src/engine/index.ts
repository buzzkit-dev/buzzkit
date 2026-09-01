import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { log } from '@buzzkit/api/libs/logger';
import { recordWorkflowRun } from '@buzzkit/observability';
import { ExitRun, RunContext } from './context';
import { describeFailure } from './errors';
import { applySubscriberFacets } from './facets';
import { runSteps } from './steps';
import type { RunParams } from './types';

export class EngineWorkflow extends WorkflowEntrypoint<Env, RunParams> {
  async run(event: WorkflowEvent<RunParams>, step: WorkflowStep): Promise<void> {
    const context = new RunContext(this.env, this.ctx, event.payload, step);
    try {
      await applySubscriberFacets(context);
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
    const { runId, workflowSlug, tenantId, subscriberId, trigger } = context.params;
    const fields = { runId, workflow: workflowSlug, tenantId, subscriberId };

    return context.do(finish.status === 'completed' ? 'finish' : 'fail', async () => {
      if (finish.status === 'failed') {
        log.error('[Engine] Run failed', { ...fields, step: finish.step, error: finish.error });
        if (finish.step) {
          await context.report(finish.step, 'failed', finish.error ?? 'The step failed');
        }
      } else {
        log.info('[Engine] Run completed', fields);
      }
      await (await context.actor()).finishRun(runId, finish);
      await recordWorkflowRun(
        this.env,
        context.runIdentity(),
        {
          result: finish.status,
          startedAt: new Date(Date.parse(trigger.timestamp) || Date.now()),
          error: finish.error,
        },
        { waitUntil: (promise) => this.ctx.waitUntil(promise) }
      );
      return {};
    });
  }
}
