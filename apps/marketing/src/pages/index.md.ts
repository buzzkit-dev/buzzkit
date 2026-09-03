import type { APIRoute } from 'astro';
import { renderHomeMarkdown } from '../lib/markdown';
import { markdownResponse } from '../lib/responses';

export const GET: APIRoute = () => {
  return markdownResponse(renderHomeMarkdown());
};
