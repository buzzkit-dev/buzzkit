import type { APIRoute } from 'astro';
import { renderFeaturesIndex } from '../../lib/llms';
import { textResponse } from '../../lib/responses';

export const GET: APIRoute = () => {
  return textResponse(renderFeaturesIndex());
};
