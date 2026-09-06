export type ErrorBody = {
  code: string;
  message: string;
  param?: string;
  details?: unknown;
};

export type ErrorContext = {
  status: number | null;
  code: string;
  param?: string;
  details?: unknown;
  requestId?: string;
  retryAfterSeconds?: number;
};

export class BuzzKitError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly param?: string;
  readonly details?: unknown;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;

  constructor(message: string, context: ErrorContext) {
    super(message);
    this.name = 'BuzzKitError';
    this.status = context.status;
    this.code = context.code;
    this.param = context.param;
    this.details = context.details;
    this.requestId = context.requestId;
    this.retryAfterSeconds = context.retryAfterSeconds;
  }
}

export class BadRequestError extends BuzzKitError {
  constructor(message: string, context: ErrorContext) {
    super(message, context);
    this.name = 'BadRequestError';
  }
}

export class AuthenticationError extends BuzzKitError {
  constructor(message: string, context: ErrorContext) {
    super(message, context);
    this.name = 'AuthenticationError';
  }
}

export class PermissionError extends BuzzKitError {
  constructor(message: string, context: ErrorContext) {
    super(message, context);
    this.name = 'PermissionError';
  }
}

export class NotFoundError extends BuzzKitError {
  constructor(message: string, context: ErrorContext) {
    super(message, context);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends BuzzKitError {
  constructor(message: string, context: ErrorContext) {
    super(message, context);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends BuzzKitError {
  constructor(message: string, context: ErrorContext) {
    super(message, context);
    this.name = 'RateLimitError';
  }
}

export class ServerError extends BuzzKitError {
  constructor(message: string, context: ErrorContext) {
    super(message, context);
    this.name = 'ServerError';
  }
}

export class ConnectionError extends BuzzKitError {
  constructor(message: string, options: { cause?: unknown; code?: string } = {}) {
    super(message, { status: null, code: options.code ?? 'connection', details: options.cause });
    this.name = 'ConnectionError';
    this.cause = options.cause;
  }
}

export class TimeoutError extends ConnectionError {
  constructor(message: string, cause?: unknown) {
    super(message, { cause, code: 'timeout' });
    this.name = 'TimeoutError';
  }
}

export class ConfigurationError extends BuzzKitError {
  constructor(message: string) {
    super(message, { status: null, code: 'configuration' });
    this.name = 'ConfigurationError';
  }
}

export function isBuzzKitError(value: unknown): value is BuzzKitError {
  return value instanceof BuzzKitError;
}

export function resolveError(
  status: number,
  body: ErrorBody,
  meta: { requestId?: string; retryAfterSeconds?: number }
): BuzzKitError {
  const context: ErrorContext = {
    status,
    code: body.code,
    param: body.param,
    details: body.details,
    requestId: meta.requestId,
    retryAfterSeconds: meta.retryAfterSeconds,
  };

  if (status === 400 || status === 422) return new BadRequestError(body.message, context);
  if (status === 401) return new AuthenticationError(body.message, context);
  if (status === 403) return new PermissionError(body.message, context);
  if (status === 404) return new NotFoundError(body.message, context);
  if (status === 409 || status === 410) return new ConflictError(body.message, context);
  if (status === 429) return new RateLimitError(body.message, context);
  if (status >= 500) return new ServerError(body.message, context);

  return new BuzzKitError(body.message, context);
}
