import { env } from 'cloudflare:workers';
import {
  ERROR_MESSAGE,
  ERROR_STATUS,
  type ErrorCode,
  isPostgresErrorCode,
  postgresErrorInfo,
} from '@buzzkit/api/utils/errorCodes';
import { Elysia } from 'elysia';
import { log } from './logger';
import { Response } from './response';

export type ErrorOptions = { code?: string; param?: string; details?: unknown };

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly param?: string;
  readonly details?: unknown;

  constructor(kind: ErrorCode, message: string, options: ErrorOptions = {}) {
    super(message);
    this.code = options.code ?? kind;
    this.status = ERROR_STATUS[kind];
    this.param = options.param;
    this.details = options.details;
  }
}

const createErrorClass = (kind: ErrorCode) =>
  class extends ApiError {
    constructor(message = ERROR_MESSAGE[kind], options?: ErrorOptions) {
      super(kind, message, options);
    }
  };

export const UnauthorizedError = createErrorClass('unauthorized');
export const ForbiddenError = createErrorClass('forbidden');
export const BadRequestError = createErrorClass('bad_request');
export const NotFoundError = createErrorClass('not_found');
export const ConflictError = createErrorClass('conflict');
export const GoneError = createErrorClass('gone');
export const InternalError = createErrorClass('internal');
export const UnavailableError = createErrorClass('unavailable');
export const MissingPermissionError = createErrorClass('missing_permission');

type ValidationIssue = { param: string; message: string };

function validationIssues(raw: string): { message: string; issues: ValidationIssue[] } {
  try {
    const parsed = JSON.parse(raw) as {
      summary?: string;
      errors?: Array<{ path?: string; summary?: string; message?: string }>;
    };
    const issues = (parsed.errors ?? []).map((issue) => ({
      param: (issue.path ?? '').replace(/^\//, '').replace(/\//g, '.'),
      message: issue.summary ?? issue.message ?? 'Invalid value',
    }));
    return { message: parsed.summary ?? ERROR_MESSAGE.validation, issues };
  } catch {
    return { message: ERROR_MESSAGE.validation, issues: [] };
  }
}

function thrownSqlState(error: unknown, depth = 0): string | undefined {
  if (depth > 3 || typeof error !== 'object' || error === null) return undefined;
  if ('code' in error && typeof error.code === 'string' && isPostgresErrorCode(error.code)) return error.code;
  if ('cause' in error) return thrownSqlState(error.cause, depth + 1);
  return undefined;
}

export const error = new Elysia()
  .error({
    UNAUTHORIZED: UnauthorizedError,
    FORBIDDEN: ForbiddenError,
    BAD_REQUEST: BadRequestError,
    NOT_FOUND: NotFoundError,
    CONFLICT: ConflictError,
    GONE: GoneError,
    INTERNAL: InternalError,
    MISSING_PERMISSION: MissingPermissionError,
  })
  .onError(({ error, code, set }) => {
    if (error instanceof ApiError) {
      return Response.error({
        error: { code: error.code, message: error.message, param: error.param, details: error.details },
      })
        .status(error.status)
        .send(set);
    }

    if (code === 'VALIDATION') {
      const { message, issues } = validationIssues(error.message);
      return Response.error({
        error: { code: 'validation', message, param: issues[0]?.param, details: issues },
      })
        .status(ERROR_STATUS.validation)
        .send(set);
    }

    if (code === 'PARSE') {
      return Response.error({ error: { code: 'parse', message: ERROR_MESSAGE.parse } })
        .status(ERROR_STATUS.parse)
        .send(set);
    }

    if (code === 'NOT_FOUND') {
      return Response.error({ error: { code: 'not_found', message: 'Route not found' } })
        .status(ERROR_STATUS.not_found)
        .send(set);
    }

    const sqlState = thrownSqlState(error);
    if (sqlState) {
      const info = postgresErrorInfo(sqlState);
      if (info.code === 'internal' || info.code === 'unavailable') {
        log.error('[Error] Database', {
          sqlState,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return Response.error({ error: { code: info.code, message: info.message } })
        .status(ERROR_STATUS[info.code])
        .send(set);
    }

    const message = error instanceof Error ? error.message : String(error);
    log.error('[Error] Unhandled', { code: String(code), error: message });
    return Response.error({
      error: {
        code: 'internal',
        message: env.ENVIRONMENT === 'development' ? message : ERROR_MESSAGE.internal,
      },
    })
      .status(ERROR_STATUS.internal)
      .send(set);
  })
  .as('global');
