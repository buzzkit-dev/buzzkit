import { ErrorCodes, getErrorInfo } from '@buzzkit/api/utils/errorCodes';
import { Elysia } from 'elysia';
import { Response } from './response';

class ApiError extends Error {
  constructor(
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

const createErrorClass = (defaultMessage: string) =>
  class extends ApiError {
    constructor(message = defaultMessage, details?: unknown) {
      super(message, details);
    }
  };

export const UnauthorizedError = createErrorClass('Unauthorized access');
export const ForbiddenError = createErrorClass('Access forbidden');
export const BadRequestError = createErrorClass('Invalid request');
export const NotFoundError = createErrorClass('Not found');
export const ConflictError = createErrorClass('Conflict');
export const GoneError = createErrorClass('Gone');
export const InternalError = createErrorClass('Internal server error');
export const MissingPermissionError = createErrorClass('Missing permission');

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
  .onError(async ({ error, code, set }) => {
    let errorCodeKey = Object.entries(ErrorCodes).find(([_, v]) => v === code)?.[0];

    const getThrownCode = (e: unknown, depth = 0): string | undefined => {
      if (depth > 3 || typeof e !== 'object' || e === null) return undefined;
      if ('code' in e && typeof e.code === 'string') return e.code;
      if ('cause' in e) return getThrownCode(e.cause, depth + 1);
      return undefined;
    };
    const thrownCode = getThrownCode(error);

    if ((errorCodeKey === undefined || errorCodeKey === 'UNKNOWN') && thrownCode) {
      errorCodeKey = Object.entries(ErrorCodes).find(([_, v]) => v === thrownCode)?.[0] ?? errorCodeKey;
    }

    errorCodeKey ??= ErrorCodes.UNKNOWN;

    const errorInfo = getErrorInfo(ErrorCodes[errorCodeKey as keyof typeof ErrorCodes] ?? errorCodeKey);

    let { message, details } = errorInfo;

    const isDatabaseError = errorCodeKey.startsWith('PG_');

    if (
      !isDatabaseError &&
      'message' in error &&
      typeof error.message === 'string' &&
      error.message !== code
    ) {
      try {
        details = JSON.parse(error.message);
      } catch {
        message = error.message;
      }
    }

    if (code === 'VALIDATION' && 'message' in error) {
      const parsed = JSON.parse(error.message);
      message = parsed.summary;
      details = parsed.errors;
    }

    return Response.error({
      error: { code: errorCodeKey, message, details },
    })
      .status(errorInfo.status)
      .send(set);
  })
  .as('global');
