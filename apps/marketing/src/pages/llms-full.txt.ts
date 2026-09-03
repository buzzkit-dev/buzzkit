import type { APIRoute } from 'astro';
import { renderFullSite } from '../lib/llms';
import { textResponse } from '../lib/responses';

export const GET: APIRoute = () => {
  return textResponse(renderFullSite());
};
