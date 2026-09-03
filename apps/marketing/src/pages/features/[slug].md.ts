import type { APIRoute } from 'astro';
import { features, findFeature } from '../../lib/features';
import { renderFeatureMarkdown } from '../../lib/markdown';
import { markdownResponse } from '../../lib/responses';

export function getStaticPaths() {
  return features.map((feature) => ({ params: { slug: feature.slug } }));
}

export const GET: APIRoute = ({ params }) => {
  return markdownResponse(renderFeatureMarkdown(findFeature(params.slug!)));
};
