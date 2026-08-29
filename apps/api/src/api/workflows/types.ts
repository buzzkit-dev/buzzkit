import type { tables } from '@buzzkit/database';
import type { WorkflowSpec } from 'buzzkit/workflows';
import type { WORKFLOW_STATUSES } from './constants';

export type Workflow = typeof tables.workflow.$inferSelect;

export type WorkflowVersion = typeof tables.workflowVersion.$inferSelect;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export type WorkflowWithVersions = Workflow & { current: WorkflowVersion | null; latest: WorkflowVersion };

export type WorkflowInput = { slug: string; name: string; description?: string | null; spec: WorkflowSpec };

export type WorkflowPatch = { name?: string; description?: string | null; spec?: WorkflowSpec };

export type WorkflowDefinition = {
  id: string;
  slug: string;
  status: 'active' | 'paused';
  versionId: string;
  spec: WorkflowSpec;
};

export type WorkflowDefinitions = { version: number; workflows: WorkflowDefinition[] };
