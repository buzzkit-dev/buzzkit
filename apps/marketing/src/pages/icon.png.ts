import type { APIRoute } from 'astro';
import { renderIcon } from '../lib/og';
import { pngResponse } from '../lib/responses';

export const GET: APIRoute = () => {
  return pngResponse(renderIcon(1024, 'public/icon.svg'));
};
