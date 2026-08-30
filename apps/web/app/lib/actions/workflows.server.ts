import {
  formatWorkflowPath,
  isWorkflowSpec,
  lintWorkflow,
  type WorkflowSpec,
} from '@buzzkit/schema/workflows';
import type { ActionFunctionArgs } from 'react-router';
import { beginAction } from '@/app/lib/actions/context.server';
import {
  ApiError,
  createWorkflow,
  deleteWorkflow,
  pauseWorkflow,
  publishWorkflow,
  testWorkflow,
  updateWorkflow,
  type WorkflowTestInput,
} from '@/app/lib/api.server';

function readSpec(form: FormData): { ok: true; spec: WorkflowSpec } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(form.get('spec') ?? ''));
  } catch {
    return { ok: false, error: 'The definition is not valid JSON.' };
  }
  const [issue] = lintWorkflow(parsed);
  if (issue) return { ok: false, error: `${formatWorkflowPath(issue.path)}: ${issue.message}` };
  if (!isWorkflowSpec(parsed)) return { ok: false, error: 'The definition is not a workflow.' };
  return { ok: true, spec: parsed };
}

function readJson(raw: FormDataEntryValue | null): { ok: true; value: unknown } | { ok: false } {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function workflowsAction(args: ActionFunctionArgs) {
  const { token, ctx, form, intent, tenant } = await beginAction(args);
  const slug = String(args.params.slug);
  const workflowSlug = String(form.get('workflow') ?? '').trim();

  try {
    switch (intent) {
      case 'create': {
        const name = String(form.get('name') ?? '').trim();
        const createdSlug = String(form.get('slug') ?? '').trim();
        const description = String(form.get('description') ?? '').trim();
        if (!name) return { error: 'Name the workflow.' };
        if (!createdSlug) return { error: 'Give the workflow a slug.' };
        const spec = readSpec(form);
        if (!spec.ok) return { error: spec.error };
        const created = await createWorkflow(ctx, token, slug, tenant, {
          name,
          slug: createdSlug,
          ...(description ? { description } : {}),
          spec: spec.spec,
        });
        return { ok: true, slug: created.slug };
      }
      case 'update': {
        const patch: { name?: string; description?: string | null; spec?: WorkflowSpec } = {};
        if (form.has('name')) {
          const name = String(form.get('name') ?? '').trim();
          if (!name) return { error: 'Name the workflow.' };
          patch.name = name;
        }
        if (form.has('description')) patch.description = String(form.get('description') ?? '').trim() || null;
        if (form.has('spec')) {
          const spec = readSpec(form);
          if (!spec.ok) return { error: spec.error };
          patch.spec = spec.spec;
        }
        const updated = await updateWorkflow(ctx, token, slug, tenant, workflowSlug, patch);
        return { ok: true, draft: updated.draft?.number ?? null };
      }
      case 'publish': {
        await publishWorkflow(ctx, token, slug, tenant, workflowSlug);
        return { ok: true, published: true };
      }
      case 'pause': {
        await pauseWorkflow(ctx, token, slug, tenant, workflowSlug);
        return { ok: true, paused: true };
      }
      case 'delete': {
        await deleteWorkflow(ctx, token, slug, tenant, workflowSlug);
        return { ok: true, deleted: true };
      }
      case 'test': {
        const input: WorkflowTestInput = {};
        const version = Number(form.get('version') ?? '');
        if (Number.isInteger(version) && version > 0) input.version = version;
        const externalId = String(form.get('externalId') ?? '').trim();
        if (externalId) input.externalId = externalId;
        const attributes = readJson(form.get('attributes'));
        if (!attributes.ok || (attributes.value !== undefined && !isRecord(attributes.value))) {
          return { error: 'Attributes must be a JSON object.' };
        }
        if (!externalId && attributes.value !== undefined) input.attributes = attributes.value;
        const eventName = String(form.get('event') ?? '').trim();
        if (eventName) {
          const data = readJson(form.get('eventData'));
          if (!data.ok || (data.value !== undefined && !isRecord(data.value))) {
            return { error: 'Event data must be a JSON object.' };
          }
          input.event = { name: eventName, ...(data.value !== undefined ? { data: data.value } : {}) };
        }
        const at = String(form.get('at') ?? '').trim();
        if (at) input.at = new Date(at).toISOString();
        const assume = readJson(form.get('assume'));
        if (!assume.ok || (assume.value !== undefined && !isRecord(assume.value))) {
          return { error: 'Assumptions must be a JSON object.' };
        }
        if (assume.value !== undefined) input.assume = assume.value as WorkflowTestInput['assume'];
        const test = await testWorkflow(ctx, token, slug, tenant, workflowSlug, input);
        return { ok: true, test };
      }
      default:
        return { error: 'Unknown action.' };
    }
  } catch (error) {
    if (error instanceof ApiError) return { error: describeFailure(intent), description: error.message };
    throw error;
  }
}

function describeFailure(intent: string): string {
  switch (intent) {
    case 'create':
      return 'Failed to create workflow';
    case 'update':
      return 'Failed to save changes';
    case 'publish':
      return 'Failed to publish workflow';
    case 'pause':
      return 'Failed to pause workflow';
    case 'delete':
      return 'Failed to delete workflow';
    case 'test':
      return 'Failed to test workflow';
    default:
      return 'Failed to update workflow';
  }
}
