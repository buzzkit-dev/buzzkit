export type Page<T> = {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
  total?: number;
};

export type PageParams = {
  limit?: number;
  cursor?: string;
};

export type PagePromise<T> = Promise<Page<T>> & AsyncIterable<T>;

export function paginate<T, TParams extends PageParams>(
  load: (params: TParams) => Promise<Page<T>>,
  params: TParams
): PagePromise<T> {
  let pending: Promise<Page<T>> | undefined;
  const first = () => {
    pending ??= load(params);
    return pending;
  };

  return {
    then: (onFulfilled, onRejected) => first().then(onFulfilled, onRejected),
    catch: (onRejected) => first().catch(onRejected),
    finally: (onFinally) => first().finally(onFinally),
    [Symbol.toStringTag]: 'PagePromise',
    async *[Symbol.asyncIterator]() {
      let page = await first();
      yield* page.items;

      while (page.hasMore && page.nextCursor !== null) {
        page = await load({ ...params, cursor: page.nextCursor });
        yield* page.items;
      }
    },
  };
}
