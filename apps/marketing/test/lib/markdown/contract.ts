import { expect } from 'vitest';
import { site } from '../../../src/lib/site';

export function expectTwinContract(markdown: string, canonical: string): void {
  const [, frontmatter, body] = /^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/.exec(markdown) ?? [];
  expect(frontmatter, 'opens with frontmatter').toBeDefined();
  expect(frontmatter).toMatch(/^title: .+\ndescription: .+\ncanonical: .+\nlast-updated: \d{4}-\d{2}-\d{2}$/);
  expect(frontmatter).toContain(`canonical: ${canonical}`);
  const headings = (body ?? '').split('\n').filter((line) => line.startsWith('# '));
  expect(headings, 'exactly one top-level heading').toHaveLength(1);
  expect(body?.startsWith('# ')).toBe(true);
  const fences = (body ?? '').split('\n').filter((line) => line.startsWith('```'));
  expect(fences.length % 2, 'every code fence is closed').toBe(0);
  expect(markdown.endsWith('\n')).toBe(true);
  expect(markdown, 'links are absolute').not.toMatch(/\]\(\//);
  for (const [, href] of markdown.matchAll(/\]\(([^)]+)\)/g)) {
    expect(href).toMatch(/^https?:\/\//);
  }
  expect(markdown).toContain(site.url);
}
