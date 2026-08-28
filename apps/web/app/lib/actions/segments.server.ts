import { type Expression, isExpression } from 'buzzkit/expressions';
import type { ActionFunctionArgs } from 'react-router';
import { beginAction } from '@/app/lib/actions/context.server';
import { sendIntent } from '@/app/lib/actions/messages.server';
import { ApiError, createSegment, deleteSegment, previewSegment, updateSegment } from '@/app/lib/api.server';

function readExpression(form: FormData): Expression | null {
  try {
    const parsed: unknown = JSON.parse(String(form.get('expression') ?? ''));
    return isExpression(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function segmentsAction(args: ActionFunctionArgs) {
  const { token, ctx, form, intent, tenant } = await beginAction(args);
  const slug = String(args.params.slug);

  try {
    switch (intent) {
      case 'preview': {
        const expression = readExpression(form);
        if (!expression) return { error: 'Finish every condition to see who matches.' };
        const preview = await previewSegment(ctx, token, slug, tenant, expression);
        return { ok: true, count: preview.count, sample: preview.sample };
      }
      case 'create': {
        const expression = readExpression(form);
        const name = String(form.get('name') ?? '').trim();
        const segmentSlug = String(form.get('slug') ?? '').trim();
        const description = String(form.get('description') ?? '').trim();
        if (!name) return { error: 'Name the segment.' };
        if (!segmentSlug) return { error: 'Give the segment a slug.' };
        if (!expression) return { error: 'Finish every condition first.' };
        const created = await createSegment(ctx, token, slug, tenant, {
          name,
          slug: segmentSlug,
          ...(description ? { description } : {}),
          expression,
        });
        return { ok: true, slug: created.slug };
      }
      case 'update': {
        const segmentSlug = String(form.get('slug') ?? '').trim();
        const name = String(form.get('name') ?? '').trim();
        const description = String(form.get('description') ?? '').trim();
        const expression = form.has('expression') ? readExpression(form) : undefined;
        if (!name) return { error: 'Name the segment.' };
        if (expression === null) return { error: 'Finish every condition first.' };
        await updateSegment(ctx, token, slug, tenant, segmentSlug, {
          name,
          description: description || null,
          ...(expression ? { expression } : {}),
        });
        return { ok: true };
      }
      case 'delete': {
        await deleteSegment(ctx, token, slug, tenant, String(form.get('slug') ?? ''));
        return { ok: true, deleted: true };
      }
      case 'send':
        return sendIntent(ctx, token, slug, tenant, form);
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
    case 'preview':
      return 'Failed to preview';
    case 'create':
      return 'Failed to create segment';
    case 'update':
      return 'Failed to save changes';
    case 'delete':
      return 'Failed to delete segment';
    default:
      return 'Failed to update segment';
  }
}
