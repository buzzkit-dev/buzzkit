export function requestUrl(request: Request): URL {
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/\.data$/, '');
  url.searchParams.delete('_routes');
  return url;
}
