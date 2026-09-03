import type { APIRoute } from 'astro';
import { type OgCard, ogCards, renderOgImage } from '../../lib/og';
import { pngResponse } from '../../lib/responses';

export function getStaticPaths() {
  return ogCards.map((card) => ({ params: { path: card.path }, props: { card } }));
}

export const GET: APIRoute<{ card: OgCard }> = async ({ props }) => {
  return pngResponse(await renderOgImage(props.card));
};
