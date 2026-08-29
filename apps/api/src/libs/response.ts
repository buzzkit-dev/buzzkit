import type { Context } from 'elysia';
import { Elysia, t } from 'elysia';
import { encodeId, type IdEntity, s } from './sqids';

const ErrorSchema = t.Object({
  code: t.String(),
  message: t.String(),
  param: t.Optional(t.String()),
  details: t.Optional(t.Any()),
});

const MetadataSchema = t.Object({
  timestamp: t.String(),
  requestId: t.Optional(t.String()),
});

function metadata(set?: Context['set']) {
  const requestId = set?.headers['request-id'];
  return {
    timestamp: new Date().toISOString(),
    ...(typeof requestId === 'string' ? { requestId } : {}),
  };
}

export const response = new Elysia()
  .guard({
    response: t.Object({
      success: t.Boolean(),
      data: t.Union([t.Any(), t.Null()]),
      error: t.Union([ErrorSchema, t.Null()]),
      metadata: MetadataSchema,
    }),
  })
  .as('global');

type CursorPagination = {
  hasMore: boolean;
  nextCursor: string | null;
  total?: number;
};

type SuccessOptions = {
  ignoreTransform?: string[];
  entity?: IdEntity;
};

const FIELD_ENTITIES: Record<string, IdEntity> = {
  workspaceId: 'workspace',
  memberId: 'member',
  invitedByMemberId: 'member',
  actorMemberId: 'member',
  acceptedMemberId: 'member',
  tenantId: 'tenant',
  keyId: 'key',
  actorKeyId: 'key',
  credentialId: 'credential',
  subscriberId: 'subscriber',
  subscriptionId: 'subscription',
  topicId: 'topic',
  messageId: 'message',
  deliveryId: 'delivery',
  auditId: 'audit',
  endpointId: 'webhook',
  webhookEventId: 'webhookEvent',
  segmentId: 'segment',
  segmentVersionId: 'segmentVersion',
  currentVersionId: 'segmentVersion',
  workflowId: 'workflow',
  workflowVersionId: 'workflowVersion',
  runId: 'run',
  inviteId: 'invite',
};

function encodeFieldId(key: string, value: number, rootEntity?: IdEntity): string {
  if (key === 'id') {
    return rootEntity ? encodeId(rootEntity, value) : s.encode([value]);
  }
  const entity = FIELD_ENTITIES[key];
  return entity ? encodeId(entity, value) : s.encode([value]);
}

type ErrorParams = {
  error: { code: string; message: string; param?: string; details?: unknown };
};

type TransformIdToString<T> =
  T extends Array<infer U>
    ? Array<TransformIdToString<U>>
    : T extends object
      ? {
          [K in keyof T]: K extends string
            ? K extends 'id'
              ? string
              : K extends `${string}Id`
                ? string
                : T[K] extends object
                  ? TransformIdToString<T[K]>
                  : T[K]
            : T[K];
        }
      : T;

function isIdField(key: string): boolean {
  if (key === 'id') return true;
  if (key.endsWith('Id')) return true;
  return false;
}

export function transformIds<T>(
  data: T,
  ignoreKeys: string[] = [],
  forceTransform: string[] = [],
  rootEntity?: IdEntity
): T {
  if (!data || typeof data !== 'object') return data;

  if (data instanceof Date) {
    return data.toISOString() as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => transformIds(item, ignoreKeys, forceTransform, rootEntity)) as T;
  }

  const transformed = { ...data };
  for (const key in transformed) {
    if (ignoreKeys.includes(key)) continue;

    const value = transformed[key];
    const shouldTransform = forceTransform.includes(key) || isIdField(key);

    if (shouldTransform && typeof value === 'number') {
      // @ts-expect-error
      transformed[key] = encodeFieldId(key, value, rootEntity);
    } else if (shouldTransform && Array.isArray(value) && value.every((item) => typeof item === 'number')) {
      // @ts-expect-error
      transformed[key] = value.map((num) => encodeFieldId(key, num, rootEntity));
    } else if (typeof value === 'object') {
      transformed[key] = transformIds(value, ignoreKeys, forceTransform);
    }
  }

  return transformed as T;
}

class SuccessResponseBuilder<T> {
  private _data: T;
  private _status = 200;
  private _cursor?: CursorPagination;
  private _ignoreTransform: string[];
  private _entity?: IdEntity;
  private _headers: Record<string, string> = {};

  constructor(data: T, options?: SuccessOptions) {
    this._data = data;
    this._ignoreTransform = options?.ignoreTransform ?? [];
    this._entity = options?.entity;
  }

  status(status: number) {
    this._status = status;
    return this;
  }

  paginated(
    pagination: CursorPagination
  ): SuccessResponseBuilder<{ items: T; hasMore: boolean; nextCursor: string | null; total?: number }> {
    this._cursor = pagination;
    return this as unknown as SuccessResponseBuilder<{
      items: T;
      hasMore: boolean;
      nextCursor: string | null;
      total?: number;
    }>;
  }

  headers(headers: Record<string, string>) {
    Object.assign(this._headers, headers);
    return this;
  }

  send(set?: Context['set']) {
    if (set) {
      set.status = this._status;
      for (const [name, value] of Object.entries(this._headers)) {
        set.headers[name] = value;
      }
    }

    const transformedData = transformIds(this._data, this._ignoreTransform, [], this._entity);
    const finalData = this._cursor
      ? {
          items: transformedData,
          hasMore: this._cursor.hasMore,
          nextCursor: this._cursor.nextCursor,
          ...(this._cursor.total === undefined ? {} : { total: this._cursor.total }),
        }
      : transformedData;

    return {
      success: true as const,
      data: finalData as TransformIdToString<T>,
      error: null,
      metadata: metadata(set),
    };
  }
}

class ErrorResponseBuilder {
  private _error: { code: string; message: string; param?: string; details?: unknown };
  private _status = 500;

  constructor(params: ErrorParams) {
    this._error = params.error;
  }

  status(status: number) {
    this._status = status;
    return this;
  }

  send(set?: Context['set']) {
    if (set) {
      set.status = this._status;
    }
    return {
      success: false as const,
      data: null,
      error: this._error,
      metadata: metadata(set),
    };
  }
}

export const Response = {
  success: <T>(data: T, options?: SuccessOptions) => new SuccessResponseBuilder(data, options),
  list: <T>(items: T[], options?: SuccessOptions) =>
    new SuccessResponseBuilder(items, options).paginated({ hasMore: false, nextCursor: null }),
  error: (params: ErrorParams) => new ErrorResponseBuilder(params),
};

export const markDeleted = <T extends object>(object: T) => ({ ...object, deleted: true as const });
