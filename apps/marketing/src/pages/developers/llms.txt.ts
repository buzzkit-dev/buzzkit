import type { APIRoute } from 'astro';
import { renderDevelopersIndex } from '../../lib/llms';
import { textResponse } from '../../lib/responses';

export const GET: APIRoute = () => {
  return textResponse(renderDevelopersIndex());
};
