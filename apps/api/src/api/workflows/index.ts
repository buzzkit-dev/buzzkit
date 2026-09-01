import type { AuditFn } from '@buzzkit/api/api/audit/index';
import { createVersioned, payloadChanged, updateVersioned } from '@buzzkit/api/api/versioning/index';
import { BadRequestError, ConflictError, NotFoundError } from '@buzzkit/api/libs/error';
import { trace } from '@buzzkit/api/libs/telemetry';
import { and, asc, type Db, desc, eq, isNull, tables } from '@buzzkit/database';
import {
  formatWorkflowPath,
  isWorkflowSpec,
  lintWorkflow,
  type WorkflowSpec,
  workflowProblem,
} from '@buzzkit/schema/workflows';
import { Value } from '@sinclair/typebox/value';
import { WORKFLOW_RESERVED_SLUGS } from './constants';
import { publishDefinitions } from './definitions';
import { assertScheduleSegment } from './schedules';
import { WorkflowSpecSchema } from './spec-schema';
import type { Workflow, WorkflowInput, WorkflowPatch, WorkflowVersion, WorkflowWithVersions } from './types';

export * from './constants';
export * from './definitions';
export * from './schedules';
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
  if (!isWorkflowSpec(value) || !Value.Check(WorkflowSpecSchema, value)) {
    const error = Value.Errors(WorkflowSpecSchema, value).First();
    throw new BadRequestError(
      workflowProblem(value) ?? (error ? `${error.message} at ${error.path || '/'}` : 'Not a valid workflow'),
      { code: 'invalid_spec', param }
    );
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
  await assertScheduleSegment(db, tenantId, input.spec);
  if (WORKFLOW_RESERVED_SLUGS.has(input.slug)) {
    throw new BadRequestError(`'${input.slug}' is reserved`, { code: 'slug_reserved', param: 'slug' });
  }
  if (await selectWorkflow(db, tenantId, input.slug)) {
    throw new ConflictError(`A workflow with the slug '${input.slug}' already exists`, {
      code: 'slug_taken',
      param: 'slug',
    });
  }

  return await trace('workflows.create', async () => {
    const { entity, version } = await createVersioned(db, {
      insertEntity: async (tx) => {
        const [workflow] = await tx
          .insert(tables.workflow)
          .values({ tenantId, slug: input.slug, name: input.name, description: input.description ?? null })
          .returning();
        return workflow!;
      },
      insertVersion: async (tx, workflow) => {
        const [inserted] = await tx
          .insert(tables.workflowVersion)
          .values({ workflowId: workflow.id, version: 1, spec: input.spec })
          .returning();
        return inserted!;
      },
    });
    return { ...entity, current: null, latest: version };
  });
}

export async function updateWorkflow(
  db: Db,
  existing: WorkflowWithVersions,
  patch: WorkflowPatch
): Promise<WorkflowWithVersions> {
  if (patch.spec !== undefined) {
    assertWorkflowSpec(patch.spec);
    await assertScheduleSegment(db, existing.tenantId, patch.spec);
  }

  return await trace('workflows.update', async () => {
    const { entity, version } = await updateVersioned(db, {
      latest: existing.latest,
      changed: payloadChanged(patch.spec, existing.latest.spec),
      insertVersion: async (tx, nextVersion) => {
        const [inserted] = await tx
          .insert(tables.workflowVersion)
          .values({ workflowId: existing.id, version: nextVersion, spec: patch.spec })
          .returning();
        return inserted!;
      },
      updateEntity: async (tx) => {
        const [workflow] = await tx
          .update(tables.workflow)
          .set({
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.description !== undefined ? { description: patch.description } : {}),
            updatedAt: new Date(),
          })
          .where(eq(tables.workflow.id, existing.id))
          .returning();
        return workflow!;
      },
    });
    return { ...entity, current: existing.current, latest: version };
  });
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

export async function transitionWorkflow(
  db: Db,
  audit: AuditFn,
  tenantId: number,
  workflowSlug: string,
  action: 'publish' | 'pause'
): Promise<WorkflowWithVersions> {
  const existing = await findWorkflowBySlug(db, tenantId, workflowSlug);

  let transitioned: WorkflowWithVersions;
  if (action === 'publish') {
    transitioned = await publishWorkflow(db, existing);
  } else {
    transitioned = await pauseWorkflow(db, existing);
  }

  await audit({
    event: action === 'publish' ? 'workflow.published' : 'workflow.paused',
    tenantId,
    target: { type: 'workflow', id: existing.id },
    data: {
      slug: existing.slug,
      ...(action === 'publish' ? { version: transitioned.latest.version } : {}),
    },
  });

  return transitioned;
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
