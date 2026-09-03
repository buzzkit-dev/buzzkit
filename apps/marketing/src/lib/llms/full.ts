import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { comparisons } from '../compare';
import { features } from '../features';
import {
  renderComparisonMarkdown,
  renderFeatureMarkdown,
  renderHomeMarkdown,
  renderPricingMarkdown,
} from '../markdown';

const HAND_KEPT_TWINS = ['developers', 'about', 'contact', 'privacy', 'auth'];

function readTwin(name: string): string {
  return readFileSync(resolve(process.cwd(), `public/${name}.md`), 'utf8');
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n\n?/, '').trim();
}

export function renderFullSite(): string {
  const documents = [
    renderHomeMarkdown(),
    ...features.map(renderFeatureMarkdown),
    ...comparisons.map(renderComparisonMarkdown),
    renderPricingMarkdown(),
    ...HAND_KEPT_TWINS.map(readTwin),
  ];
  return `${documents.map(stripFrontmatter).join('\n\n---\n\n')}\n`;
}
