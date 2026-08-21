export type ErrorCode =
  | 'bad_request'
  | 'validation'
  | 'parse'
  | 'unauthorized'
  | 'forbidden'
  | 'missing_permission'
  | 'not_found'
  | 'conflict'
  | 'gone'
  | 'rate_limited'
  | 'internal'
  | 'unavailable';

export const ERROR_STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  validation: 400,
  parse: 400,
  unauthorized: 401,
  forbidden: 403,
  missing_permission: 403,
  not_found: 404,
  conflict: 409,
  gone: 410,
  rate_limited: 429,
  internal: 500,
  unavailable: 503,
};

export const ERROR_MESSAGE: Record<ErrorCode, string> = {
  bad_request: 'Invalid request',
  validation: 'Invalid request',
  parse: 'Request body could not be parsed',
  unauthorized: 'Unauthorized',
  forbidden: 'Forbidden',
  missing_permission: 'You do not have permission to perform this action',
  not_found: 'Resource not found',
  conflict: 'Conflict',
  gone: 'Gone',
  rate_limited: 'Too many requests',
  internal: 'Internal server error',
  unavailable: 'Service temporarily unavailable',
};

const POSTGRES_ERRORS: Record<string, { code: ErrorCode; message: string }> = {
  '23505': { code: 'conflict', message: 'A record with these values already exists' },
  '23503': { code: 'bad_request', message: 'A referenced record does not exist' },
  '23502': { code: 'bad_request', message: 'A required field is missing' },
  '23514': { code: 'bad_request', message: 'A value violates a constraint' },
  '23P01': { code: 'conflict', message: 'A value conflicts with an existing record' },
  '22001': { code: 'bad_request', message: 'A value is too long' },
  '22003': { code: 'bad_request', message: 'A numeric value is out of range' },
  '22007': { code: 'bad_request', message: 'A date value is invalid' },
  '22P02': { code: 'bad_request', message: 'A value has an invalid format' },
  '53100': { code: 'unavailable', message: 'Service temporarily unavailable' },
  '53200': { code: 'unavailable', message: 'Service temporarily unavailable' },
  '53300': { code: 'unavailable', message: 'Service temporarily unavailable' },
  '08000': { code: 'unavailable', message: 'Service temporarily unavailable' },
  '08006': { code: 'unavailable', message: 'Service temporarily unavailable' },
};

const SQLSTATE = /^[0-9A-Z]{5}$/;

export function isPostgresErrorCode(value: string): boolean {
  return SQLSTATE.test(value);
}

export function postgresErrorInfo(sqlState: string): { code: ErrorCode; message: string } {
  return POSTGRES_ERRORS[sqlState] ?? { code: 'internal', message: ERROR_MESSAGE.internal };
}
