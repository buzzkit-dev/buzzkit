import type { RunCounts } from '@buzzkit/api/api/runs/index';
import { encodeId } from '@buzzkit/api/libs/sqids';
import type { WorkflowSpec } from '@buzzkit/schema/workflows';
import type { Workflow, WorkflowVersion } from './types';

export function serializeVersion(version: WorkflowVersion) {
  return {
    id: encodeId('workflowVersion', version.id),
    number: version.version,
    publishedAt: version.publishedAt,
    createdAt: version.createdAt,
  };
}

export function serializeWorkflow(
  workflow: Workflow,
  current: WorkflowVersion | null,
  latest: WorkflowVersion,
  extras: { versions?: WorkflowVersion[]; runs?: RunCounts } = {}
) {
  const spec = latest.spec as WorkflowSpec;
  return {
    id: encodeId('workflow', workflow.id),
    slug: workflow.slug,
    name: workflow.name,
    description: workflow.description,
    status: workflow.status,
    trigger: spec.trigger,
    spec,
    current: current ? serializeVersion(current) : null,
    draft: current && current.id === latest.id ? null : serializeVersion(latest),
    ...(extras.versions
      ? {
          versions: extras.versions.map((version) => ({
            ...serializeVersion(version),
            spec: version.spec as WorkflowSpec,
          })),
        }
      : {}),
    ...(extras.runs ? { runs: extras.runs } : {}),
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
  };
}
