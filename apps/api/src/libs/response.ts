import type { Context } from 'elysia';
import { Elysia, t } from 'elysia';
import { encodeId, type IdEntity, s } from './sqids';

const ErrorSchema = t.Object({
  code: t.String(),
  message: t.String(),
  details: t.Optional(t.Any()),
});

const MetadataSchema = t.Object({
  timestamp: t.Number(),
});

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

class AppError {
  constructor(
    private status: number,
    private code: string,
    private message: string,
    private details?: unknown
  ) {}

  withDetails(details: unknown) {
    this.details = details;
    return this;
  }

  send(set?: Context['set']) {
    if (set && this.status) {
      set.status = this.status;
    }
    return {
      success: false as const,
      data: null,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
      status: this.status,
    };
  }
}

type CursorPagination = {
  hasMore: boolean;
  nextCursor: string | null;
};

type SuccessOptions = {
  ignoreTransform?: string[];
  forceTransform?: string[];
  entity?: IdEntity;
};

const FIELD_ENTITIES: Record<string, IdEntity> = {
  workspaceId: 'workspace',
  memberId: 'member',
  invitedByMemberId: 'member',
  tenantId: 'tenant',
  keyId: 'key',
  actorKeyId: 'key',
  credentialId: 'credential',
  subscriberId: 'subscriber',
  subscriptionId: 'subscription',
  topicId: 'topic',
  messageId: 'message',
  deliveryId: 'delivery',
  eventId: 'event',
  segmentId: 'segment',
  campaignId: 'campaign',
  workflowId: 'workflow',
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
  error: { code: string; message: string; details?: unknown } | AppError;
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
                : K extends `${string}_id`
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
  if (key.endsWith('_id')) return true;
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
  private _forceTransform: string[];
  private _entity?: IdEntity;
  private _headers: Record<string, string> = {};

  constructor(data: T, options?: SuccessOptions) {
    this._data = data;
    this._ignoreTransform = options?.ignoreTransform ?? [];
    this._forceTransform = options?.forceTransform ?? [];
    this._entity = options?.entity;
  }

  status(status: number) {
    this._status = status;
    return this;
  }

  paginated(
    pagination: CursorPagination
  ): SuccessResponseBuilder<{ items: T; hasMore: boolean; nextCursor: string | null }> {
    this._cursor = pagination;
    return this as unknown as SuccessResponseBuilder<{
      items: T;
      hasMore: boolean;
      nextCursor: string | null;
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

    const transformedData = transformIds(
      this._data,
      this._ignoreTransform,
      this._forceTransform,
      this._entity
    );
    const finalData = this._cursor
      ? {
          items: transformedData,
          hasMore: this._cursor.hasMore,
          nextCursor: this._cursor.nextCursor,
        }
      : transformedData;

    return {
      success: true as const,
      data: finalData as TransformIdToString<T>,
      error: null,
      metadata: {
        timestamp: Date.now(),
      },
    };
  }
}

class ErrorResponseBuilder {
  private _error: { code: string; message: string; details?: unknown };
  private _status = 500;

  constructor(params: ErrorParams) {
    if (params.error instanceof AppError) {
      const errorResponse = params.error.send();
      this._error = errorResponse.error;
      this._status = errorResponse.status;
    } else {
      this._error = params.error;
    }
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
      metadata: {
        timestamp: Date.now(),
      },
    };
  }
}

export const Response = {
  success: <T>(data: T, options?: SuccessOptions) => new SuccessResponseBuilder(data, options),
  error: (params: ErrorParams) => new ErrorResponseBuilder(params),
};
