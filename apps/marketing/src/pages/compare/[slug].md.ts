import type { APIRoute } from 'astro';
import { comparisons, findComparison } from '../../lib/compare';
import { renderComparisonMarkdown } from '../../lib/markdown';
import { markdownResponse } from '../../lib/responses';

export function getStaticPaths() {
  return comparisons.map((comparison) => ({ params: { slug: comparison.slug } }));
}

export const GET: APIRoute = ({ params }) => {
  return markdownResponse(renderComparisonMarkdown(findComparison(params.slug!)));
};
