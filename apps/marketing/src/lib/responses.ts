export function markdownResponse(body: string): Response {
  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
}

export function textResponse(body: string): Response {
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export function pngResponse(body: ArrayBuffer): Response {
  return new Response(body, { headers: { 'Content-Type': 'image/png' } });
}
