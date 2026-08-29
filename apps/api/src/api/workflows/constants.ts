import { workflowStatus } from '@buzzkit/database';

export const WORKFLOW_STATUSES = workflowStatus.enumValues;

export const WORKFLOW_RESERVED_SLUGS = new Set(['new']);

export const DEFINITIONS_KEY_PREFIX = 'defs:';

export const DEFINITIONS_VERSION_KEY_PREFIX = 'defs-version:';
