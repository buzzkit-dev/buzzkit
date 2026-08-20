export const ErrorCodes = {
  UNKNOWN: 'UNKNOWN',
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  PARSE: 'PARSE',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  INVALID_COOKIE_SIGNATURE: 'INVALID_COOKIE_SIGNATURE',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  GONE: 'GONE',
  BAD_REQUEST: 'BAD_REQUEST',
  MISSING_PERMISSION: 'MISSING_PERMISSION',
  PG_DUPLICATE_ENTRY: '23505',
  PG_FOREIGN_KEY_VIOLATION: '23503',
  PG_NOT_NULL_VIOLATION: '23502',
  PG_CHECK_VIOLATION: '23514',
  PG_EXCLUSION_VIOLATION: '23P01',
  PG_STRING_DATA_LENGTH: '22001',
  PG_NUMERIC_OUT_OF_RANGE: '22003',
  PG_INVALID_DATETIME: '22007',
  PG_INVALID_TEXT_REPRESENTATION: '22P02',
  PG_INSUFFICIENT_PRIVILEGE: '42501',
  PG_SYNTAX_ERROR: '42601',
  PG_UNDEFINED_COLUMN: '42703',
  PG_UNDEFINED_TABLE: '42P01',
  PG_DISK_FULL: '53100',
  PG_OUT_OF_MEMORY: '53200',
  PG_TOO_MANY_CONNECTIONS: '53300',
  PG_CONNECTION_EXCEPTION: '08000',
  PG_CONNECTION_FAILURE: '08006',
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

interface ErrorInfo {
  message: string;
  status: number;
  details?: string;
}

export function getErrorInfo(code: ErrorCode | string): ErrorInfo {
  switch (code) {
    case ErrorCodes.UNKNOWN:
      return {
        message: 'An unknown error occurred',
        status: 500,
      };
    case ErrorCodes.VALIDATION:
      return {
        message: 'Invalid input data',
        status: 400,
      };
    case ErrorCodes.NOT_FOUND:
      return {
        message: 'Resource not found',
        status: 404,
      };
    case ErrorCodes.PARSE:
      return {
        message: 'Failed to parse request data',
        status: 400,
      };
    case ErrorCodes.INTERNAL_SERVER_ERROR:
      return {
        message: 'Internal server error',
        status: 500,
      };
    case ErrorCodes.INVALID_COOKIE_SIGNATURE:
      return {
        message: 'Invalid cookie signature',
        status: 401,
      };
    case ErrorCodes.UNAUTHORIZED:
      return {
        message: 'Unauthorized',
        status: 401,
      };
    case ErrorCodes.FORBIDDEN:
      return {
        message: 'Forbidden',
        status: 403,
      };
    case ErrorCodes.CONFLICT:
      return {
        message: 'Conflict',
        status: 409,
      };
    case ErrorCodes.GONE:
      return {
        message: 'Gone',
        status: 410,
      };
    case ErrorCodes.BAD_REQUEST:
      return {
        message: 'Bad request',
        status: 400,
      };
    case ErrorCodes.MISSING_PERMISSION:
      return {
        message: 'You do not have permission to perform this action',
        status: 403,
      };
    case ErrorCodes.PG_DUPLICATE_ENTRY:
      return {
        message: 'Duplicate entry',
        status: 409,
        details: 'A record with this unique constraint already exists',
      };
    case ErrorCodes.PG_FOREIGN_KEY_VIOLATION:
      return {
        message: 'Referenced record not found',
        status: 400,
        details: 'The referenced foreign key does not exist',
      };
    case ErrorCodes.PG_NOT_NULL_VIOLATION:
      return {
        message: 'Required field missing',
        status: 400,
      };
    case ErrorCodes.PG_CHECK_VIOLATION:
      return {
        message: 'Check constraint violation',
        status: 400,
      };
    case ErrorCodes.PG_EXCLUSION_VIOLATION:
      return {
        message: 'Exclusion constraint violation',
        status: 409,
      };
    case ErrorCodes.PG_STRING_DATA_LENGTH:
      return {
        message: 'String data too long',
        status: 400,
      };
    case ErrorCodes.PG_NUMERIC_OUT_OF_RANGE:
      return {
        message: 'Numeric value out of range',
        status: 400,
      };
    case ErrorCodes.PG_INVALID_DATETIME:
      return {
        message: 'Invalid datetime format',
        status: 400,
      };
    case ErrorCodes.PG_INVALID_TEXT_REPRESENTATION:
      return {
        message: 'Invalid text representation',
        status: 400,
      };
    case ErrorCodes.PG_INSUFFICIENT_PRIVILEGE:
      return {
        message: 'Insufficient privileges',
        status: 403,
      };
    case ErrorCodes.PG_SYNTAX_ERROR:
      return {
        message: 'Syntax error',
        status: 400,
        details: 'Invalid SQL syntax',
      };
    case ErrorCodes.PG_UNDEFINED_COLUMN:
      return {
        message: 'Undefined column',
        status: 400,
        details: 'The requested column does not exist',
      };
    case ErrorCodes.PG_UNDEFINED_TABLE:
      return {
        message: 'Undefined table',
        status: 400,
        details: 'The requested table does not exist',
      };
    case ErrorCodes.PG_DISK_FULL:
      return {
        message: 'Disk full',
        status: 507,
        details: 'The server is out of disk space',
      };
    case ErrorCodes.PG_OUT_OF_MEMORY:
      return {
        message: 'Out of memory',
        status: 503,
        details: 'The server is out of memory',
      };
    case ErrorCodes.PG_TOO_MANY_CONNECTIONS:
      return {
        message: 'Too many connections',
        status: 503,
        details: 'Maximum connection limit reached',
      };
    case ErrorCodes.PG_CONNECTION_EXCEPTION:
      return {
        message: 'Connection exception',
        status: 503,
      };
    case ErrorCodes.PG_CONNECTION_FAILURE:
      return {
        message: 'Connection failure',
        status: 503,
        details: 'Database connection failed',
      };
    default:
      return {
        message: 'An unknown error occurred',
        status: 500,
      };
  }
}
