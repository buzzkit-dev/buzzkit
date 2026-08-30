import { env } from 'cloudflare:workers';
import { encodeId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { and, type Db, eq, inArray, isNull, tables } from '@buzzkit/database';
import type { WorkflowSpec } from '@buzzkit/schema/workflows';
import { DEFINITIONS_KEY_PREFIX, DEFINITIONS_VERSION_KEY_PREFIX } from './constants';
import type { WorkflowDefinitions } from './types';

export function definitionsKey(tenantId: number): string {
  return `${DEFINITIONS_KEY_PREFIX}${tenantId}`;
}

export function definitionsVersionKey(tenantId: number): string {
  return `${DEFINITIONS_VERSION_KEY_PREFIX}${tenantId}`;
}

export async function listDefinitions(db: Db, tenantId: number): Promise<WorkflowDefinitions> {
  const rows = await db
    .select({ workflow: tables.workflow, version: tables.workflowVersion })
    .from(tables.workflow)
    .innerJoin(tables.workflowVersion, eq(tables.workflowVersion.id, tables.workflow.currentVersionId))
    .where(
      and(
        eq(tables.workflow.tenantId, tenantId),
        inArray(tables.workflow.status, ['active', 'paused']),
        isNull(tables.workflow.deletedAt)
      )
    )
    .orderBy(tables.workflow.id);
  return {
    version: Date.now(),
    workflows: rows.map(({ workflow, version }) => ({
      id: encodeId('workflow', workflow.id),
      slug: workflow.slug,
      status: workflow.status as 'active' | 'paused',
      versionId: encodeId('workflowVersion', version.id),
      spec: version.spec as WorkflowSpec,
    })),
  };
}

export async function publishDefinitions(db: Db, tenantId: number): Promise<WorkflowDefinitions> {
  return await trace('workflows.publishDefinitions', { 'tenant.id': tenantId }, async (t) => {
    const definitions = await listDefinitions(db, tenantId);
    await env.ENGINE_DEFS.put(definitionsKey(tenantId), JSON.stringify(definitions));
    await env.ENGINE_DEFS.put(definitionsVersionKey(tenantId), String(definitions.version));
    t.set('workflows.active', definitions.workflows.length);
    return definitions;
  });
}

export async function readDefinitions(tenantId: number): Promise<WorkflowDefinitions | null> {
  return await env.ENGINE_DEFS.get<WorkflowDefinitions>(definitionsKey(tenantId), 'json');
}

export async function readDefinitionsVersion(tenantId: number): Promise<number | null> {
  const raw = await env.ENGINE_DEFS.get(definitionsVersionKey(tenantId));
  return raw === null ? null : Number(raw);
}
