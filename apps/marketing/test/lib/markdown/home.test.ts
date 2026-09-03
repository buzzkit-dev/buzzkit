import { describe, expect, it } from 'vitest';
import { deepDives, faq, features, hero, selfHost } from '../../../src/lib/content';
import { renderHomeMarkdown } from '../../../src/lib/markdown/home';
import { site } from '../../../src/lib/site';
import { SELF_HOST } from '../../../src/lib/snippets';
import { expectTwinContract } from './contract';

describe('renderHomeMarkdown', () => {
  const markdown = renderHomeMarkdown();

  it('obeys the twin contract', () => {
    expectTwinContract(markdown, `${site.url}/`);
    expect(markdown).toContain(`# ${hero.headline}`);
  });

  it('is deterministic', () => {
    expect(renderHomeMarkdown()).toBe(markdown);
  });

  it('carries every homepage section, deep dive and question', () => {
    for (const feature of features) expect(markdown).toContain(`### ${feature.title}`);
    for (const dive of deepDives) expect(markdown).toContain(`## ${dive.title}`);
    for (const item of faq) expect(markdown).toContain(`### ${item.question}`);
    expect(markdown).toContain(`## ${selfHost.title}`);
    expect(markdown).toContain(`\`\`\`\n${SELF_HOST}\n\`\`\``);
  });

  it('links the agent surface', () => {
    for (const path of [
      '/llms.txt',
      '/llms-full.txt',
      '/openapi.json',
      '/auth.md',
      '/.well-known/agent-skills/index.json',
    ]) {
      expect(markdown).toContain(`${site.url}${path}`);
    }
  });
});
