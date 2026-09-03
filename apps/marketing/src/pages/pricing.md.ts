import type { APIRoute } from 'astro';
import { renderPricingMarkdown } from '../lib/markdown';
import { markdownResponse } from '../lib/responses';

export const GET: APIRoute = () => {
  return markdownResponse(renderPricingMarkdown());
};
