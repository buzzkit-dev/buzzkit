import type { APIRoute } from 'astro';
import { renderHomeIndex } from '../lib/llms';
import { textResponse } from '../lib/responses';

export const GET: APIRoute = () => {
  return textResponse(renderHomeIndex());
};
