import { BadRequestError, ConflictError, NotFoundError } from '@buzzkit/api/libs/error';
import { trace } from '@buzzkit/api/libs/telemetry';
import { stableStringify } from '@buzzkit/api/utils/json';
import { and, asc, type Db, desc, eq, isNull, tables } from '@buzzkit/database';
import {
  formatWorkflowPath,
  isWorkflowSpec,
  lintWorkflow,
  type WorkflowSpec,
  workflowProblem,
} from 'buzzkit/workflows';
import { WORKFLOW_RESERVED_SLUGS } from './constants';
import { publishDefinitions } from './definitions';
import type { Workflow, WorkflowInput, WorkflowPatch, WorkflowVersion, WorkflowWithVersions } from './types';

export * from './constants';
export * from './definitions';
export * from './schemas';
export { serializeVersion, serializeWorkflow } from './serialize';
export type * from './types';

export function assertWorkflowSpec(value: unknown, param = 'spec'): asserts value is WorkflowSpec {
  const [issue] = lintWorkflow(value);
  if (issue) {
    throw new BadRequestError(issue.message, {
      code: 'invalid_spec',
      param: issue.path.length === 0 ? param : `${param}.${formatWorkflowPath(issue.path)}`,
    });
  }
  if (!isWorkflowSpec(value)) {
    throw new BadRequestError(workflowProblem(value) ?? 'Not a valid workflow', {
      code: 'invalid_spec',
      param,
    });
  }
}

async function selectWorkflow(db: Db, tenantId: number, slug: string): Promise<Workflow | null> {
  const [row] = await db
    .select()
    .from(tables.workflow)
    .where(
      and(
        eq(tables.workflow.tenantId, tenantId),
        eq(tables.workflow.slug, slug),
        isNull(tables.workflow.deletedAt)
      )
    );
  return row ?? null;
}

export async function listWorkflowVersions(db: Db, workflowId: number): Promise<WorkflowVersion[]> {
  return await db
    .select()
    .from(tables.workflowVersion)
    .where(eq(tables.workflowVersion.workflowId, workflowId))
    .orderBy(desc(tables.workflowVersion.version));
}

async function withVersions(
  db: Db,
  workflow: Workflow
): Promise<WorkflowWithVersions & { versions: WorkflowVersion[] }> {
  const versions = await listWorkflowVersions(db, workflow.id);
  const latest = versions[0];
  if (!latest) throw new NotFoundError('Workflow has no version');
  const current = versions.find((version) => version.id === workflow.currentVersionId) ?? null;
  return { ...workflow, current, latest, versions };
}

export async function findWorkflowBySlug(
  db: Db,
  tenantId: number,
  slug: string
): Promise<WorkflowWithVersions & { versions: WorkflowVersion[] }> {
  const workflow = await selectWorkflow(db, tenantId, slug);
  if (!workflow) throw new NotFoundError('Workflow not found');
  return await withVersions(db, workflow);
}

export async function listWorkflows(db: Db, tenantId: number): Promise<WorkflowWithVersions[]> {
  const workflows = await db
    .select()
    .from(tables.workflow)
    .where(and(eq(tables.workflow.tenantId, tenantId), isNull(tables.workflow.deletedAt)))
    .orderBy(asc(tables.workflow.name));
  if (workflows.length === 0) return [];
  const versions = await db
    .select({ version: tables.workflowVersion })
    .from(tables.workflowVersion)
    .innerJoin(tables.workflow, eq(tables.workflow.id, tables.workflowVersion.workflowId))
    .where(and(eq(tables.workflow.tenantId, tenantId), isNull(tables.workflow.deletedAt)))
    .then((rows) => rows.map((row) => row.version));
  return workflows.map((workflow) => {
    const own = versions.filter((version) => version.workflowId === workflow.id);
    const latest = own.reduce((best, version) => (version.version > best.version ? version : best), own[0]!);
    return {
      ...workflow,
      current: own.find((version) => version.id === workflow.currentVersionId) ?? null,
      latest,
    };
  });
}

export async function createWorkflow(
  db: Db,
  tenantId: number,
  input: WorkflowInput
): Promise<WorkflowWithVersions> {
  assertWorkflowSpec(input.spec);
  if (WORKFLOW_RESERVED_SLUGS.has(input.slug)) {
    throw new BadRequestError(`'${input.slug}' is reserved`, { code: 'slug_reserved', param: 'slug' });
  }
  if (await selectWorkflow(db, tenantId, input.slug)) {
    throw new ConflictError(`A workflow with the slug '${input.slug}' already exists`, {
      code: 'slug_taken',
      param: 'slug',
    });
  }
  return await trace('workflows.create', async () =>
    db.transaction(async (tx) => {
      const [workflow] = await tx
        .insert(tables.workflow)
        .values({ tenantId, slug: input.slug, name: input.name, description: input.description ?? null })
        .returning();
      const [version] = await tx
        .insert(tables.workflowVersion)
        .values({ workflowId: workflow!.id, version: 1, spec: input.spec })
        .returning();
      return { ...workflow!, current: null, latest: version! };
    })
  );
}

export async function updateWorkflow(
  db: Db,
  existing: WorkflowWithVersions,
  patch: WorkflowPatch
): Promise<WorkflowWithVersions> {
  if (patch.spec !== undefined) assertWorkflowSpec(patch.spec);
  return await trace('workflows.update', async () =>
    db.transaction(async (tx) => {
      let latest = existing.latest;
      const specChanged =
        patch.spec !== undefined && stableStringify(patch.spec) !== stableStringify(existing.latest.spec);
      if (specChanged) {
        const [version] = await tx
          .insert(tables.workflowVersion)
          .values({ workflowId: existing.id, version: existing.latest.version + 1, spec: patch.spec })
          .returning();
        latest = version!;
      }
      const [workflow] = await tx
        .update(tables.workflow)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          updatedAt: new Date(),
        })
        .where(eq(tables.workflow.id, existing.id))
        .returning();
      return { ...workflow!, current: existing.current, latest };
    })
  );
}

export async function publishWorkflow(db: Db, existing: WorkflowWithVersions): Promise<WorkflowWithVersions> {
  return await trace('workflows.publish', { 'workflow.id': existing.id }, async () => {
    const now = new Date();
    const published = await db.transaction(async (tx) => {
      const [version] = await tx
        .update(tables.workflowVersion)
        .set({ publishedAt: now })
        .where(eq(tables.workflowVersion.id, existing.latest.id))
        .returning();
      const [workflow] = await tx
        .update(tables.workflow)
        .set({ status: 'active', currentVersionId: existing.latest.id, updatedAt: now })
        .where(eq(tables.workflow.id, existing.id))
        .returning();
      return { ...workflow!, current: version!, latest: version! };
    });
    await publishDefinitions(db, existing.tenantId);
    return published;
  });
}

export async function pauseWorkflow(db: Db, existing: WorkflowWithVersions): Promise<WorkflowWithVersions> {
  if (existing.status !== 'active') {
    throw new BadRequestError('Only an active workflow can be paused', { code: 'workflow_not_active' });
  }
  return await trace('workflows.pause', { 'workflow.id': existing.id }, async () => {
    const [workflow] = await db
      .update(tables.workflow)
      .set({ status: 'paused', updatedAt: new Date() })
      .where(eq(tables.workflow.id, existing.id))
      .returning();
    await publishDefinitions(db, existing.tenantId);
    return { ...workflow!, current: existing.current, latest: existing.latest };
  });
}

export async function softDeleteWorkflow(db: Db, existing: WorkflowWithVersions): Promise<Workflow> {
  return await trace('workflows.softDelete', { 'workflow.id': existing.id }, async () => {
    const [workflow] = await db
      .update(tables.workflow)
      .set({ deletedAt: new Date(), status: 'paused' })
      .where(eq(tables.workflow.id, existing.id))
      .returning();
    await publishDefinitions(db, existing.tenantId);
    return workflow!;
  });
}
