import type { APIRoute } from 'astro';
import { renderComparisonsIndex } from '../../lib/llms';
import { textResponse } from '../../lib/responses';

export const GET: APIRoute = () => {
  return textResponse(renderComparisonsIndex());
};
