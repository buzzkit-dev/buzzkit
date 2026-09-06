import type { PageParams, PagePromise } from '../core/pagination';
import type { Transport } from '../core/transport';
import { encodeSegment } from '../core/transport';
import type { ActorType, MemberRole } from './common';
import { listPage } from './list';

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceMember = {
  id: string;
  role: MemberRole;
  createdAt: string;
  updatedAt: string;
};

export type AuditActorType = ActorType;

export type AuditEvent = {
  id: string;
  event: string;
  tenantId: string | null;
  actorType: AuditActorType;
  actorDisplay: string;
  actorMemberId: string | null;
  actorKeyId: string | null;
  targetType: string | null;
  targetId: string | null;
  data: Record<string, unknown> | null;
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type CreateWorkspaceParams = {
  name: string;
  slug: string;
  avatarUrl?: string;
};

export type UpdateWorkspaceParams = {
  name?: string;
  slug?: string;
  avatarUrl?: string;
};

export type ListAuditParams = PageParams & {
  q?: string;
  event?: string;
  actorType?: AuditActorType;
  from?: string;
  to?: string;
};

export function workspacesResource(transport: Transport) {
  return {
    list(): PagePromise<Workspace> {
      return listPage(transport, '/v1/workspaces', {});
    },

    create(params: CreateWorkspaceParams): Promise<Workspace> {
      return transport.request({ method: 'POST', path: '/v1/workspaces', body: params });
    },

    retrieve(slug: string): Promise<Workspace> {
      return transport.request({ method: 'GET', path: `/v1/workspaces/${encodeSegment(slug)}` });
    },

    update(slug: string, params: UpdateWorkspaceParams): Promise<Workspace> {
      return transport.request({
        method: 'PATCH',
        path: `/v1/workspaces/${encodeSegment(slug)}`,
        body: params,
      });
    },
  };
}

export function membersResource(transport: Transport, workspaceSlug: string) {
  const base = `/v1/workspaces/${encodeSegment(workspaceSlug)}/members`;

  return {
    list(): PagePromise<WorkspaceMember> {
      return listPage(transport, base, {});
    },

    retrieve(id: string): Promise<WorkspaceMember> {
      return transport.request({ method: 'GET', path: `${base}/${encodeSegment(id)}` });
    },
  };
}

export function auditResource(transport: Transport, workspaceSlug: string) {
  const base = `/v1/workspaces/${encodeSegment(workspaceSlug)}/audit`;

  return {
    list(params: ListAuditParams = {}): PagePromise<AuditEvent> {
      return listPage(transport, base, params);
    },
  };
}

export type WorkspacesResource = ReturnType<typeof workspacesResource>;

export type MembersResource = ReturnType<typeof membersResource>;

export type AuditResource = ReturnType<typeof auditResource>;
