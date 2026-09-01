import type { api } from '@buzzkit/api/contract';
import { treaty } from '@elysiajs/eden';

type ApiContract = typeof api;
type RawApiClient = ReturnType<typeof treaty<ApiContract>>;
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type ApiMetadata = {
  timestamp: string;
  requestId?: string;
};

type ApiErrorBody = {
  code: string;
  message: string;
  param?: string;
  details?: JsonValue;
};

type ApiSuccessEnvelope<T> = {
  success: true;
  data: T;
  error: null;
  metadata: ApiMetadata;
};

type ApiErrorEnvelope = {
  success: false;
  data: null;
  error: ApiErrorBody;
  metadata: ApiMetadata;
};

type NormalizeError<T> = T extends { status: infer Status; value: infer Value }
  ? {
      status: Status;
      value: Value extends ApiErrorEnvelope ? Value['error'] : ApiErrorBody;
    }
  : never;

type NormalizeResponse<T> = T extends {
  data: infer Data;
  error: infer Error;
  response: infer Response;
  status: infer Status;
  headers: infer Headers;
}
  ? Error extends null
    ? {
        data: Data extends ApiSuccessEnvelope<infer Payload> ? Payload : Data;
        error: null;
        response: Response;
        status: Status;
        headers: Headers;
      }
    : {
        data: null;
        error: NormalizeError<Error>;
        response: Response;
        status: Status;
        headers: Headers;
      }
  : never;

type WrapCallable<T extends (...args: never[]) => unknown> = ((
  ...args: Parameters<T>
) => ReturnType<T> extends Promise<infer Response>
  ? Promise<NormalizeResponse<Response>>
  : WrapClient<ReturnType<T>>) & {
  [K in keyof T]: WrapClient<T[K]>;
};

type WrapClient<T> = T extends (...args: never[]) => unknown
  ? WrapCallable<T>
  : T extends object
    ? {
        [K in keyof T]: WrapClient<T[K]>;
      }
    : T;

export type RootApiClient = WrapClient<RawApiClient>;
export type ApiVersion = Extract<keyof RootApiClient, `v${number}`>;
export type VersionedApiClient<TVersion extends ApiVersion> = RootApiClient[TVersion];

export type ClientOptions = {
  baseUrl: string;
  getAuthHeader?: () =>
    | Promise<Record<string, string> | null | undefined>
    | Record<string, string>
    | null
    | undefined;
};

export type VersionedClientOptions<TVersion extends ApiVersion> = ClientOptions & {
  version: TVersion;
};

const wrappedTargets = new WeakMap<object, object>();

export function createRootClient({ baseUrl, getAuthHeader }: ClientOptions): RootApiClient {
  const client = treaty<ApiContract>(baseUrl, {
    headers: async () => (await getAuthHeader?.()) ?? {},
  });

  return wrapClient(client);
}

export function createVersionedClient<TVersion extends ApiVersion>({
  version,
  ...options
}: VersionedClientOptions<TVersion>): VersionedApiClient<TVersion> {
  const client = createRootClient(options);
  return client[version];
}

function wrapClient<T>(value: T): WrapClient<T> {
  if (!isWrappable(value)) return value as WrapClient<T>;

  const cached = wrappedTargets.get(value);
  if (cached) return cached as WrapClient<T>;

  const wrapped =
    typeof value === 'function'
      ? new Proxy(value, {
          apply(target, thisArg, args) {
            return wrapValue(Reflect.apply(target, thisArg, args));
          },
          get(target, property, receiver) {
            return wrapValue(Reflect.get(target, property, receiver));
          },
        })
      : new Proxy(value, {
          get(target, property, receiver) {
            return wrapValue(Reflect.get(target, property, receiver));
          },
        });

  wrappedTargets.set(value, wrapped);
  return wrapped as WrapClient<T>;
}

function wrapValue<T>(value: T) {
  if (value instanceof Promise) {
    return value.then((result) => normalizeResponse(result));
  }

  if (isWrappable(value)) return wrapClient(value);
  return value;
}

function normalizeResponse<T>(result: T): NormalizeResponse<T> {
  if (!isTreatyResponse(result)) {
    throw new TypeError('Unexpected API response shape.');
  }

  if (result.error) {
    if (!isApiErrorEnvelope(result.error.value)) {
      throw new TypeError('Unexpected API error response shape.');
    }

    return {
      data: null,
      error: {
        status: result.error.status,
        value: result.error.value.error,
      },
      response: result.response,
      status: result.status,
      headers: result.headers,
    } as NormalizeResponse<T>;
  }

  if (!isApiSuccessEnvelope(result.data)) {
    throw new TypeError('Unexpected API success response shape.');
  }

  return {
    data: result.data.data,
    error: null,
    response: result.response,
    status: result.status,
    headers: result.headers,
  } as NormalizeResponse<T>;
}

function isWrappable(value: unknown): value is object {
  return (typeof value === 'function' || typeof value === 'object') && value !== null;
}

function isTreatyResponse(value: unknown): value is {
  data: unknown;
  error: { status: number; value: unknown } | null;
  response: Response;
  status: number;
  headers: ResponseInit['headers'];
} {
  return (
    isRecord(value) &&
    'data' in value &&
    'error' in value &&
    'response' in value &&
    'status' in value &&
    'headers' in value
  );
}

function isApiSuccessEnvelope(value: unknown): value is ApiSuccessEnvelope<JsonValue> {
  return (
    isRecord(value) &&
    value.success === true &&
    'data' in value &&
    value.error === null &&
    isMetadata(value.metadata)
  );
}

function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  return (
    isRecord(value) &&
    value.success === false &&
    value.data === null &&
    isApiErrorBody(value.error) &&
    isMetadata(value.metadata)
  );
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    (!('param' in value) || value.param === undefined || typeof value.param === 'string') &&
    (!('details' in value) || value.details === undefined || isJsonValue(value.details))
  );
}

function isMetadata(value: unknown): value is ApiMetadata {
  return isRecord(value) && (typeof value.timestamp === 'string' || value.timestamp instanceof Date);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
