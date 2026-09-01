import type { Workspace } from './types';

export function serializeWorkspace(workspace: Workspace) {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    avatarUrl: workspace.avatarUrl,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };
}
