import type { Sql } from 'postgres';

export const CONNECTION_RETRY_DELAYS_MS = [50, 200];

const CONNECTION_ERROR_CODES = new Set([
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
  'CONNECT_TIMEOUT',
  '58000',
  '57P01',
  '57P03',
  '53300',
]);

export type ConnectionRetryOptions = {
  delaysMs?: number[];
  onRetry?: (error: unknown, attempt: number) => void;
};

export function isConnectionError(caught: unknown, depth = 0): boolean {
  if (depth > 3 || typeof caught !== 'object' || caught === null) return false;
  if ('code' in caught && typeof caught.code === 'string') {
    if (CONNECTION_ERROR_CODES.has(caught.code) || caught.code.startsWith('08')) return true;
  }
  return 'cause' in caught && isConnectionError(caught.cause, depth + 1);
}

export async function retryOnConnectionError<T>(
  run: () => Promise<T>,
  options: ConnectionRetryOptions,
  canRetry: () => boolean = () => true
): Promise<T> {
  const delays = options.delaysMs ?? CONNECTION_RETRY_DELAYS_MS;
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const delay = delays[attempt];
      if (delay === undefined || !canRetry() || !isConnectionError(error)) throw error;
      options.onRetry?.(error, attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

type UnsafeArguments = Parameters<Sql['unsafe']>;
type BeginCallback = (transaction: unknown) => Promise<unknown>;

export function withConnectionRetry(client: Sql, options: ConnectionRetryOptions): Sql {
  const unsafe = (...args: UnsafeArguments) => ({
    then: <T>(resolve: (rows: unknown) => T, reject: (error: unknown) => T) =>
      retryOnConnectionError(async () => await client.unsafe(...args), options).then(resolve, reject),
    values: () => retryOnConnectionError(() => client.unsafe(...args).values(), options),
  });

  const begin = (...args: unknown[]) => {
    const callback = args.at(-1) as BeginCallback;
    const leading = args.slice(0, -1) as string[];
    let started = false;
    const guarded: BeginCallback = (transaction) => {
      started = true;
      return callback(transaction);
    };
    const run = () => (client.begin as (...inner: unknown[]) => Promise<unknown>)(...leading, guarded);

    return retryOnConnectionError(run, options, () => !started);
  };

  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === 'unsafe') return unsafe;
      if (property === 'begin') return begin;
      return Reflect.get(target, property, receiver);
    },
  });
}
