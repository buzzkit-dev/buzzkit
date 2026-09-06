import type { Page, PageParams, PagePromise } from '../core/pagination';
import type { Transport } from '../core/transport';

export function listPage<T, TParams extends PageParams>(
  transport: Transport,
  path: string,
  params: TParams
): PagePromise<T> {
  return transport.requestPage((query: TParams) => {
    return transport.request<Page<T>>({ method: 'GET', path, query });
  }, params);
}
